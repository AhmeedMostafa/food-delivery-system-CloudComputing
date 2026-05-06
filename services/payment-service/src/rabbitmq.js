import amqp from 'amqplib';
import pool from './db.js';

let channel = null;
let connection = null;

const MAX_RETRIES = 10;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

// Dead Letter Exchange and Queue names
const DLX_EXCHANGE = 'payment_queue_dlx';
const DLQ_NAME = 'payment_queue_dead';
const QUEUE_NAME = 'payment_queue';

/**
 * Build the AMQP connection URL from individual env vars or fall back to RABBITMQ_URL.
 * This ensures credentials stored in K8s Secrets are properly embedded in the URL.
 */
const buildAmqpUrl = () => {
  if (process.env.RABBITMQ_URL && process.env.RABBITMQ_URL.includes('@')) {
    return process.env.RABBITMQ_URL;
  }
  const user = process.env.RABBITMQ_DEFAULT_USER || 'guest';
  const pass = process.env.RABBITMQ_DEFAULT_PASS || 'guest';
  const host = (process.env.RABBITMQ_URL || 'amqp://localhost:5672')
    .replace('amqp://', '')
    .replace(/\/.*$/, '');
  return `amqp://${user}:${pass}@${host}`;
};

/**
 * Connect to RabbitMQ with exponential backoff retry.
 * Sets up:
 *   - A Dead Letter Exchange (DLX) and Dead Letter Queue for failed messages
 *   - The main payment_queue bound to the DLX
 *   - A consumer that processes messages and nacks failures to the DLQ
 */
export const connectRabbitMQ = async (attempt = 1) => {
  try {
    const amqpServer = buildAmqpUrl();
    connection = await amqp.connect(amqpServer);
    channel = await connection.createChannel();

    // Set up Dead Letter infrastructure
    await channel.assertExchange(DLX_EXCHANGE, 'fanout', { durable: true });
    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.bindQueue(DLQ_NAME, DLX_EXCHANGE, '');

    // Assert main queue with DLX routing
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX_EXCHANGE,
      },
    });

    console.log('[payment-service] Connected to RabbitMQ, waiting for messages...');

    // Consume messages from payment_queue
    channel.consume(QUEUE_NAME, async (message) => {
      if (message !== null) {
        try {
          const data = JSON.parse(message.content.toString());
          const { order_id, user_id, amount, method } = data;

          if (!order_id || !user_id || !amount) {
            console.warn('[payment-service] Invalid message received, sending to DLQ:', data);
            // Nack without requeue — routes to DLQ via DLX
            channel.nack(message, false, false);
            return;
          }

          const VALID_METHODS = ['CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'WALLET'];
          const paymentMethod = method && VALID_METHODS.includes(method) ? method : 'CREDIT_CARD';
          const parsedAmount = parseFloat(amount);

          if (isNaN(parsedAmount) || parsedAmount <= 0) {
            console.warn(`[payment-service] Invalid amount for order ${order_id}, sending to DLQ`);
            channel.nack(message, false, false);
            return;
          }

          await pool.query(
            `INSERT INTO payment_svc.transactions (order_id, user_id, amount, method, status)
             VALUES ($1, $2, $3, $4, 'COMPLETED')`,
            [order_id, user_id, parsedAmount, paymentMethod]
          );
          console.log(`[payment-service] Processed payment for order ${order_id}`);

          channel.ack(message);
        } catch (err) {
          console.error('[payment-service] Error processing message:', err.message);
          // Nack without requeue — failed messages go to DLQ for manual review
          channel.nack(message, false, false);
        }
      }
    });

    // Auto-reconnect on unexpected close
    connection.on('close', (err) => {
      if (err) {
        console.error('[payment-service] RabbitMQ connection lost, reconnecting...');
        channel = null;
        connection = null;
        setTimeout(() => connectRabbitMQ(1), INITIAL_DELAY_MS);
      }
    });

    connection.on('error', (err) => {
      console.error('[payment-service] RabbitMQ connection error:', err.message);
    });
  } catch (err) {
    channel = null;
    connection = null;
    if (attempt <= MAX_RETRIES) {
      const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      console.warn(`[payment-service] RabbitMQ connect attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return connectRabbitMQ(attempt + 1);
    }
    console.error(`[payment-service] RabbitMQ connection failed after ${MAX_RETRIES} attempts. Giving up.`);
  }
};

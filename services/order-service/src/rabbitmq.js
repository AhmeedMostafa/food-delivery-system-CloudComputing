import amqp from 'amqplib';

let channel = null;
let connection = null;

const MAX_RETRIES = 10;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

/**
 * Build the AMQP connection URL from individual env vars or fall back to RABBITMQ_URL.
 * This ensures credentials stored in K8s Secrets are properly embedded in the URL.
 */
const buildAmqpUrl = () => {
  if (process.env.RABBITMQ_URL && process.env.RABBITMQ_URL.includes('@')) {
    // URL already contains credentials — use as-is
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
 * On connection loss, automatically attempts reconnection.
 */
export const connectRabbitMQ = async (attempt = 1) => {
  try {
    const amqpServer = buildAmqpUrl();
    connection = await amqp.connect(amqpServer);
    channel = await connection.createChannel();
    await channel.assertQueue('payment_queue', { durable: true });

    console.log('[order-service] Connected to RabbitMQ');

    // Auto-reconnect on unexpected close
    connection.on('close', (err) => {
      if (err) {
        console.error('[order-service] RabbitMQ connection lost, reconnecting...');
        channel = null;
        connection = null;
        setTimeout(() => connectRabbitMQ(1), INITIAL_DELAY_MS);
      }
    });

    connection.on('error', (err) => {
      console.error('[order-service] RabbitMQ connection error:', err.message);
    });
  } catch (err) {
    channel = null;
    connection = null;
    if (attempt <= MAX_RETRIES) {
      const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      console.warn(`[order-service] RabbitMQ connect attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return connectRabbitMQ(attempt + 1);
    }
    console.error(`[order-service] RabbitMQ connection failed after ${MAX_RETRIES} attempts. Giving up.`);
  }
};

export const getChannel = () => channel;

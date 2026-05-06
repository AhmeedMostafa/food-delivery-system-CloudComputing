import amqp from 'amqplib';
import pool from './db.js';

export const connectRabbitMQ = async () => {
  try {
    const amqpServer = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
    const connection = await amqp.connect(amqpServer);
    const channel = await connection.createChannel();
    await channel.assertQueue('payment_queue', { durable: true });
    
    console.log('[payment-service] Connected to RabbitMQ, waiting for messages...');
    
    channel.consume('payment_queue', async (message) => {
      if (message !== null) {
        try {
          const data = JSON.parse(message.content.toString());
          const { order_id, user_id, amount, method } = data;
          
          if (!order_id || !user_id || !amount) {
            console.warn('[payment-service] Invalid message received:', data);
            channel.ack(message);
            return;
          }

          const VALID_METHODS = ['CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'WALLET'];
          const paymentMethod = method && VALID_METHODS.includes(method) ? method : 'CREDIT_CARD';
          const parsedAmount = parseFloat(amount);

          if (!isNaN(parsedAmount) && parsedAmount > 0) {
            await pool.query(
              `INSERT INTO payment_svc.transactions (order_id, user_id, amount, method, status)
               VALUES ($1, $2, $3, $4, 'COMPLETED')`,
              [order_id, user_id, parsedAmount, paymentMethod]
            );
            console.log(`[payment-service] Processed payment for order ${order_id}`);
          }
          
          channel.ack(message);
        } catch (err) {
          console.error('[payment-service] Error processing message:', err.message);
          // Nack and requeue could be done here, but for simplicity we'll ack to not block the queue
          channel.ack(message);
        }
      }
    });
  } catch (err) {
    console.error('[payment-service] RabbitMQ connection failed:', err.message);
    // Retry logic could be added here
  }
};

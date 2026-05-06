import amqp from 'amqplib';

let channel = null;

export const connectRabbitMQ = async () => {
  try {
    const amqpServer = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
    const connection = await amqp.connect(amqpServer);
    channel = await connection.createChannel();
    await channel.assertQueue('payment_queue', { durable: true });
    console.log('[order-service] Connected to RabbitMQ');
  } catch (err) {
    console.error('[order-service] RabbitMQ connection failed:', err.message);
  }
};

export const getChannel = () => channel;

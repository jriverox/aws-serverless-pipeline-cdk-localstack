import {
  Context,
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { OrderRequest } from '../types/orderRequest';

const validateOrderRequest = (body: any): body is OrderRequest => {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof body.amount === 'number' &&
    typeof body.userId === 'string' &&
    typeof body.description === 'string'
  );
};

const createOrder = (body: any): OrderRequest => {
  return {
    orderId: `order-${Date.now()}`,
    amount: body.amount,
    userId: body.userId,
    description: body.description,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
};

const sqs = new SQSClient({});

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  let result;

  try {
    const body = JSON.parse(event.body || '{}');

    if (!validateOrderRequest(body)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message:
            'Invalid request body. Must contain amount (number), userId (string), and description (string).',
        }),
      };
    }

    const order = createOrder(body);

    // Aquí iría la lógica para enviar el mensaje a la cola SQS usando la URL de la variable de entorno
    const queueUrl = process.env.QUEUE_URL;

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(order),
    });
    await sqs.send(command);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' }, // Recomendado para REST API
      body: JSON.stringify({
        message: 'Order received successfully.',
        orderId: order.orderId,
      }),
    };
  } catch (error) {
    console.error('Error processing order:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error.' }),
    };
  }
};

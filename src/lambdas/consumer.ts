import { Context, SQSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoDBClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true, // Útil para evitar errores si un campo opcional es undefined
    convertClassInstanceToMap: true,
  },
});

export const handler = async (
  event: SQSEvent,
  context: Context,
): Promise<void> => {
  try {
    for (const record of event.Records) {
      const messageBody = record.body;
      console.log('Received message:', messageBody);
      // Aquí iría la lógica para hacer un PutItem en DynamoDB usando el contenido del mensaje
      const order = JSON.parse(messageBody);

      const putItemCommand = new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
          ...order,
          processedAt: new Date().toISOString(),
        },
        ConditionExpression: 'attribute_not_exists(orderId)',
      });

      await ddbDocClient.send(putItemCommand);
      console.log(`Order ${order.orderId} saved successfully.`);
    }
  } catch (error) {
    console.error('Error inserting item:', error);
    throw error;
  }
};

import * as cdk from 'aws-cdk-lib/core';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import {
  HttpUrlIntegration,
  HttpLambdaIntegration,
} from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export class AwsCdkDemo01Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // DynamoDB Table
    const ordersTable = new dynamodb.TableV2(this, 'OrdersTable', {
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // solo para pruebas
    });

    // SQS Queue
    const ordersQueue = new sqs.Queue(this, 'OrdersQueue', {
      visibilityTimeout: cdk.Duration.seconds(30),
    });

    // Lambda Producer
    const fnProducer = new NodejsFunction(this, 'ProducerFunction', {
      entry: 'src/lambdas/producer.ts',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      environment: { QUEUE_URL: ordersQueue.queueUrl },
      architecture: lambda.Architecture.ARM_64,
      bundling: { minify: true },
    });

    // Lambda consumer
    const fnConsumer = new NodejsFunction(this, 'ConsumerFunction', {
      entry: 'src/lambdas/consumer.ts',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      environment: { TABLE_NAME: ordersTable.tableName },
      architecture: lambda.Architecture.ARM_64,
      bundling: { minify: true },
    });

    // Integración Lambda con SQS
    const eventSource = new lambdaEventSources.SqsEventSource(ordersQueue, {
      batchSize: 10,
    });

    fnConsumer.addEventSource(eventSource);

    // API Gateway (Standard REST API - Free en LocalStack)
    const api = new apigateway.RestApi(this, 'OrdersApi', {
      restApiName: 'Orders Service',
      description: 'Servicio de ingesta de pedidos',
      deployOptions: {
        stageName: 'prod',
      },
    });

    const ordersResource = api.root.addResource('orders');
    ordersResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(fnProducer),
    );

    // Permisos
    ordersQueue.grantSendMessages(fnProducer);
    ordersTable.grantWriteData(fnConsumer);
    ordersQueue.grantConsumeMessages(fnConsumer);
  }
}

# Implementation Guide

This document walks through the full lifecycle of the exercise: setup, implementation, deployment, testing, and teardown.

---

## Exercise Overview

Build and validate a serverless ingestion pipeline using AWS CDK v2, TypeScript, and LocalStack. The target architecture connects the following AWS services:

```
API Gateway → Lambda Producer → SQS Queue → Lambda Consumer → DynamoDB
```

An HTTP POST to the REST API triggers the Producer Lambda, which enqueues the payload. The Consumer Lambda is triggered by SQS and persists each record to DynamoDB.

---

## 1. Project Setup

### Create and initialize the CDK project

```bash
mkdir aws-cdk-demo01 && cd aws-cdk-demo01
cdk init app --language typescript
```

### Install dependencies

```bash
# Dev dependencies
npm install -D \
  typescript \
  ts-node \
  esbuild \
  @types/node \
  @types/aws-lambda \
  aws-cdk

# Runtime dependencies
npm install \
  aws-cdk-lib \
  constructs \
  @aws-sdk/client-sqs \
  @aws-sdk/client-dynamodb \
  @aws-sdk/lib-dynamodb
```

---

## 2. CDK Stack Implementation

Edit the generated file at `lib/*-stack.ts` to define all infrastructure constructs.

Reference implementation:
[https://gist.github.com/jriverox/2cf3f5dd265fa45cf94040c4c5675501](https://gist.github.com/jriverox/2cf3f5dd265fa45cf94040c4c5675501)

The stack should declare:

- A **DynamoDB table** (`OrdersTable`) with a partition key
- An **SQS queue** with a Dead Letter Queue (DLQ, `maxReceiveCount: 3`)
- A **Producer Lambda** (`NodejsFunction`) that receives API Gateway events and sends messages to SQS
- A **Consumer Lambda** (`NodejsFunction`) that reads from SQS and writes to DynamoDB
- A **REST API Gateway** (`LambdaRestApi` or manual `RestApi`) exposing `POST /orders`
- IAM grants via CDK: `queue.grantSendMessages(producer)`, `table.grantWriteData(consumer)`
- An `SqsEventSource` binding the queue to the Consumer Lambda

---

## 3. Lambda Implementations

Place Lambda source files outside `lib/`, for example under `src/lambdas/`.

### Producer Lambda

Receives the API Gateway event, validates the body, and enqueues the message to SQS.

Reference: [https://gist.github.com/jriverox/3cb89b9955c60cc1101d93c55331bde8](https://gist.github.com/jriverox/3cb89b9955c60cc1101d93c55331bde8)

Key patterns:

- Instantiate `SQSClient` **outside** the handler (connection reuse)
- Parse `event.body` safely: `JSON.parse(event.body ?? '{}')`
- Return a properly shaped API Gateway response: `{ statusCode, body: JSON.stringify(...) }`

### Consumer Lambda

Iterates over `event.Records`, parses each message body, and persists the order to DynamoDB.

Reference: [https://gist.github.com/jriverox/ec97a8620f292b56f5073f19f7f6acbd](https://gist.github.com/jriverox/ec97a8620f292b56f5073f19f7f6acbd)

Key patterns:

- Instantiate `DynamoDBDocumentClient` **outside** the handler
- Process records: `for (const record of event.Records) { const body = JSON.parse(record.body) ... }`
- Use `PutCommand` from `@aws-sdk/lib-dynamodb` — no manual `marshall` needed

---

## 4. Deployment

Make sure LocalStack is running before deploying.

```bash
# Start LocalStack (if not already running)
docker-compose up -d

# Bootstrap the CDK toolkit in LocalStack
cdklocal bootstrap

# Deploy the stack
cdklocal deploy --require-approval never
```

---

## 5. Identify Deployed Resources

CDK and LocalStack generate dynamic physical names. Retrieve them before testing:

```bash
# Get API Gateway ID (needed to construct the endpoint URL)
awslocal apigateway get-rest-apis

# Get SQS Queue URL
awslocal sqs list-queues

# Get DynamoDB table name
awslocal dynamodb list-tables

# Get Lambda function names
awslocal lambda list-functions --query 'Functions[*].FunctionName'
```

The base URL for the API endpoint follows this pattern:

```
http://localhost:4566/restapis/<API_ID>/prod/_user_request_/orders
```

Replace `<API_ID>` with the value returned by `get-rest-apis`.

---

## 6. End-to-End Testing

### Send a test order

```bash
curl -X POST http://localhost:4566/restapis/<API_ID>/prod/_user_request_/orders \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_01", "amount": 100, "description": "test order"}'
```

### Verify the record in DynamoDB

```bash
awslocal dynamodb scan --table-name <TABLE_NAME>
```

If the record appears in the scan output, the full pipeline is working correctly.

---

## 7. Diagnostics

Use these commands to investigate failures at each layer.

**Check for stuck or invisible SQS messages:**

```bash
awslocal sqs get-queue-attributes \
  --queue-url <QUEUE_URL> \
  --attribute-names All
```

**Invoke a Lambda directly (bypass API Gateway):**

```bash
awslocal lambda invoke \
  --function-name <FUNCTION_NAME> \
  --payload '{"body": "{\"userId\":\"test\"}"}' \
  output.json
```

**Temporarily disable the SQS → Lambda trigger (useful for inspecting queue contents):**

```bash
# Get the event source mapping UUID
awslocal lambda list-event-source-mappings --function-name <CONSUMER_FUNCTION_NAME>

# Disable the trigger
awslocal lambda update-event-source-mapping --uuid <UUID> --no-enabled

# Re-enable when done
awslocal lambda update-event-source-mapping --uuid <UUID> --enabled
```

**Tail LocalStack container logs:**

```bash
docker logs -f localstack-main
```

**Clear queue or table data:**

```bash
# Purge all messages from the SQS queue
awslocal sqs purge-queue --queue-url <QUEUE_URL>

# Delete and redeploy the DynamoDB table
awslocal dynamodb delete-table --table-name <TABLE_NAME>
cdklocal deploy --require-approval never
```

---

## 8. Teardown

**Destroy CDK-managed resources in LocalStack:**

```bash
cdklocal destroy
```

**Hard reset (use when LocalStack behaves unexpectedly):**

Run this from the directory containing `docker-compose.yml`:

```bash
docker-compose down
rm -rf ./localstack_data
docker system prune -f
```

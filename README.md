# AWS Serverless Ingestion Pipeline Demo

> Event-driven order ingestion pipeline built with **AWS CDK v2**, **TypeScript**, and **LocalStack** — fully runnable locally without incurring cloud costs.

---

## Table of Contents

- [AWS Serverless Ingestion Pipeline Demo](#aws-serverless-ingestion-pipeline-demo)
  - [Table of Contents](#table-of-contents)
  - [Architecture](#architecture)
  - [Tech Stack](#tech-stack)
  - [Project Structure](#project-structure)
  - [Prerequisites](#prerequisites)
  - [Getting Started](#getting-started)
    - [1. Start LocalStack](#1-start-localstack)
    - [2. Install dependencies](#2-install-dependencies)
    - [3. Bootstrap and deploy](#3-bootstrap-and-deploy)
    - [4. Discover resource identifiers](#4-discover-resource-identifiers)
    - [5. Run the end-to-end test](#5-run-the-end-to-end-test)
  - [Key Engineering Decisions](#key-engineering-decisions)
  - [Teardown](#teardown)
  - [License](#license)

---

## Architecture

The system implements an asynchronous decoupling pattern for scalability and resilience:

```
API Gateway (REST)
      │
      ▼
Lambda Producer        ← Validates payload, enqueues message
      │
      ▼
Amazon SQS             ← Acts as buffer for traffic spikes
      │
      ▼
Lambda Consumer        ← Processes messages asynchronously
      │
      ▼
Amazon DynamoDB        ← Persistent order storage
```

**Flow summary:** An HTTP POST to the REST API triggers the Producer Lambda, which validates the request body and pushes the payload to an SQS queue. The Consumer Lambda is triggered by the queue and persists each order to DynamoDB.

---

## Tech Stack

| Layer                  | Technology                                          |
| ---------------------- | --------------------------------------------------- |
| Language               | TypeScript                                          |
| Infrastructure as Code | AWS CDK v2                                          |
| Runtime                | Node.js 20.x (ARM_64)                               |
| Bundler                | esbuild (via `NodejsFunction`)                      |
| Local AWS Simulation   | LocalStack (Community Edition)                      |
| AWS SDK                | AWS SDK v3 (`@aws-sdk/lib-dynamodb` DocumentClient) |

---

## Project Structure

```
.
├── bin/
│   └── app.ts                  # CDK App entry point
├── lib/
│   └── ingestion-stack.ts      # CDK Stack definition (all constructs)
├── src/
│   └── lambdas/
│       ├── producer.ts         # API Gateway → SQS
│       └── consumer.ts         # SQS → DynamoDB
├── docker-compose.yml          # LocalStack setup
├── cdk.json
└── package.json
```

---

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) & Docker Compose
- Node.js v20+
- AWS CDK and LocalStack wrapper:

```bash
npm install -g aws-cdk aws-cdk-local
pip install awscli-local --break-system-packages
```

---

## Getting Started

### 1. Start LocalStack

```bash
docker-compose up -d
```

### 2. Install dependencies

```bash
npm install
```

### 3. Bootstrap and deploy

```bash
cdklocal bootstrap
cdklocal deploy --require-approval never
```

### 4. Discover resource identifiers

Since CDK and LocalStack generate dynamic names, retrieve the identifiers you'll need for testing:

```bash
# API Gateway ID and endpoint base
awslocal apigateway get-rest-apis

# SQS Queue URL
awslocal sqs list-queues

# DynamoDB table name
awslocal dynamodb list-tables

# Lambda function names
awslocal lambda list-functions --query 'Functions[*].FunctionName'
```

### 5. Run the end-to-end test

Replace `<API_ID>` with the value returned in step 4:

```bash
curl -X POST http://localhost:4566/restapis/<API_ID>/prod/_user_request_/orders \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_01", "amount": 100, "description": "test order"}'
```

Verify the record was persisted (replace `<TABLE_NAME>`):

```bash
awslocal dynamodb scan --table-name <TABLE_NAME>
```

---

## Key Engineering Decisions

**SDK clients instantiated outside the handler** — Reusing TCP connections across Lambda invocations reduces cold start overhead and improves throughput, consistent with AWS best practices.

**`NodejsFunction` with esbuild bundling** — Automatic TypeScript transpilation and tree-shaking at deploy time, producing lean Lambda packages optimized for ARM_64.

**`DynamoDBDocumentClient`** — Provides a higher-level abstraction over the raw DynamoDB client, eliminating the need for manual `marshall`/`unmarshall` calls and making handler code cleaner and more maintainable.

**`PAY_PER_REQUEST` billing mode** — Chosen for the DynamoDB table to avoid capacity planning during development and to reflect real-world serverless cost patterns.

**Dead Letter Queue (DLQ)** — The SQS queue is configured with a DLQ (`maxReceiveCount: 3`) to capture messages that repeatedly fail processing, preventing silent data loss.

---

## Teardown

Destroy all LocalStack resources created by CDK:

```bash
cdklocal destroy
```

If LocalStack becomes unstable, perform a hard reset from the directory containing `docker-compose.yml`:

```bash
docker-compose down
rm -rf ./localstack_data
docker system prune -f
```

---

## License

MIT

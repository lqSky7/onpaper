// Automated Serverless Infrastructure Deployment Script
// Provisions zero-idle-cost AWS architecture per Blueprint Section 20

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  IAMClient,
  CreateRoleCommand,
  GetRoleCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  AddPermissionCommand,
} from "@aws-sdk/client-lambda";
import {
  ApiGatewayV2Client,
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
  GetApisCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  S3Client,
  CreateBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE_NAME = "onpaper-data";
const USER_POOL_NAME = "onpaper-users";
const API_NAME = "onpaper-api-gateway";

const ddbClient = new DynamoDBClient({ region: REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
const iamClient = new IAMClient({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });
const apiGwClient = new ApiGatewayV2Client({ region: REGION });
const s3Client = new S3Client({ region: REGION });

async function main() {
  console.log(`=== Deploying OnPaper AWS Serverless Infrastructure (${REGION}) ===`);

  // 1. DynamoDB Table (On-Demand / Pay-Per-Request, Zero Idle Cost)
  console.log(`[1/7] Ensuring DynamoDB table "${TABLE_NAME}"...`);
  try {
    await ddbClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`DynamoDB table "${TABLE_NAME}" already exists.`);
  } catch (err: any) {
    if (err.name === "ResourceNotFoundException") {
      console.log(`Creating DynamoDB table "${TABLE_NAME}" (On-Demand)...`);
      await ddbClient.send(
        new CreateTableCommand({
          TableName: TABLE_NAME,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "PK", AttributeType: "S" },
            { AttributeName: "SK", AttributeType: "S" },
            { AttributeName: "GSI1PK", AttributeType: "S" },
            { AttributeName: "GSI1SK", AttributeType: "S" },
            { AttributeName: "GSI2PK", AttributeType: "S" },
            { AttributeName: "GSI2SK", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "PK", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: "GSI1",
              KeySchema: [
                { AttributeName: "GSI1PK", KeyType: "HASH" },
                { AttributeName: "GSI1SK", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
            {
              IndexName: "GSI2",
              KeySchema: [
                { AttributeName: "GSI2PK", KeyType: "HASH" },
                { AttributeName: "GSI2SK", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          ],
        })
      );
      console.log(`DynamoDB table created.`);
    } else {
      throw err;
    }
  }

  // 2. Cognito User Pool (50k MAUs Free Tier)
  console.log(`[2/7] Ensuring Cognito User Pool "${USER_POOL_NAME}"...`);
  let userPoolId = "";
  let userPoolClientId = "";
  const pools = await cognitoClient.send(new ListUserPoolsCommand({ MaxResults: 20 }));
  const existingPool = pools.UserPools?.find((p) => p.Name === USER_POOL_NAME);

  if (existingPool && existingPool.Id) {
    userPoolId = existingPool.Id;
    console.log(`Cognito User Pool exists: ${userPoolId}`);
  } else {
    const created = await cognitoClient.send(
      new CreateUserPoolCommand({
        PoolName: USER_POOL_NAME,
        AutoVerifiedAttributes: ["email"],
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireUppercase: true,
            RequireLowercase: true,
            RequireNumbers: true,
            RequireSymbols: false,
          },
        },
      })
    );
    userPoolId = created.UserPool?.Id || "";
    console.log(`Created Cognito User Pool: ${userPoolId}`);

    const clientRes = await cognitoClient.send(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "onpaper-app-client",
        GenerateSecret: false,
        ExplicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_USER_SRP_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ],
      })
    );
    userPoolClientId = clientRes.UserPoolClient?.ClientId || "";
    console.log(`Created Cognito Client: ${userPoolClientId}`);
  }

  // 3. S3 Export Bucket (With 7-day Lifecycle Expiration)
  const callerIdentity = execSync("aws sts get-caller-identity", { encoding: "utf-8" });
  const accountId = JSON.parse(callerIdentity).Account;
  const bucketName = `onpaper-exports-${accountId}-${REGION}`;
  console.log(`[3/7] Ensuring S3 Bucket "${bucketName}"...`);
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`S3 bucket exists: ${bucketName}`);
  } catch {
    console.log(`Creating S3 bucket: ${bucketName}`);
    try {
      await s3Client.send(
        new CreateBucketCommand({
          Bucket: bucketName,
          CreateBucketConfiguration: REGION === "us-east-1" ? undefined : { LocationConstraint: REGION as any },
        })
      );
      await s3Client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: bucketName,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: "ExpireExportsAfter7Days",
                Status: "Enabled",
                Filter: { Prefix: "" },
                Expiration: { Days: 7 },
              },
            ],
          },
        })
      );
      console.log("S3 Bucket created with 7-day expiration.");
    } catch (err: any) {
      console.log(`S3 bucket notice: ${err.message}`);
    }
  }

  // 4. IAM Role for Lambda
  const roleName = "onpaper-lambda-execution-role";
  console.log(`[4/7] Ensuring IAM Role "${roleName}"...`);
  let roleArn = "";
  try {
    const roleRes = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    roleArn = roleRes.Role?.Arn || "";
    console.log(`IAM Role exists: ${roleArn}`);
  } catch {
    const assumeRolePolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    });

    const createRes = await iamClient.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: assumeRolePolicy,
        Description: "Execution role for OnPaper Lambdas",
      })
    );
    roleArn = createRes.Role?.Arn || "";

    await iamClient.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      })
    );

    const ddbPolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:DeleteItem",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:BatchWriteItem",
          ],
          Resource: [
            `arn:aws:dynamodb:${REGION}:${accountId}:table/${TABLE_NAME}`,
            `arn:aws:dynamodb:${REGION}:${accountId}:table/${TABLE_NAME}/index/*`,
          ],
        },
      ],
    });

    await iamClient.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: "OnPaperDynamoDBPolicy",
        PolicyDocument: ddbPolicy,
      })
    );

    console.log(`Created IAM Role: ${roleArn}. Waiting 10s for propagation...`);
    await new Promise((r) => setTimeout(r, 10000));
  }

  // 5. Package and Deploy API Lambda (ARM64)
  console.log("[5/7] Bundling and packaging Lambda functions...");
  execSync("npm run build", { stdio: "inherit" });

  const zipPath = path.resolve("./dist/lambda.zip");
  execSync(`cd dist && zip -rq lambda.zip . && mv lambda.zip ..`, { stdio: "pipe" });
  const zipBuffer = fs.readFileSync("./lambda.zip");

  const functionName = "onpaper-api";
  let lambdaArn = "";
  try {
    const fn = await lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }));
    lambdaArn = fn.Configuration?.FunctionArn || "";
    console.log(`Updating code for Lambda "${functionName}"...`);
    await lambdaClient.send(
      new UpdateFunctionCodeCommand({
        FunctionName: functionName,
        ZipFile: zipBuffer,
        Architectures: ["arm64"],
      })
    );
  } catch (err: any) {
    if (err.name === "ResourceNotFoundException") {
      console.log(`Creating Lambda "${functionName}" (ARM64 Node.js 22)...`);
      const created = await lambdaClient.send(
        new CreateFunctionCommand({
          FunctionName: functionName,
          Runtime: "nodejs22.x",
          Role: roleArn,
          Handler: "backend/src/api-handler.handler",
          Code: { ZipFile: zipBuffer },
          Architectures: ["arm64"],
          Timeout: 15,
          MemorySize: 256,
          Environment: {
            Variables: {
              TABLE_NAME,
              AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
            },
          },
        })
      );
      lambdaArn = created.FunctionArn || "";
    } else {
      throw err;
    }
  }

  // 6. API Gateway HTTP API
  console.log(`[6/7] Ensuring API Gateway HTTP API "${API_NAME}"...`);
  let apiId = "";
  let apiEndpoint = "";
  const apis = await apiGwClient.send(new GetApisCommand({}));
  const existingApi = apis.Items?.find((a) => a.Name === API_NAME);

  if (existingApi && existingApi.ApiId) {
    apiId = existingApi.ApiId;
    apiEndpoint = existingApi.ApiEndpoint || `https://${apiId}.execute-api.${REGION}.amazonaws.com`;
    console.log(`API Gateway exists: ${apiEndpoint}`);
  } else {
    const apiRes = await apiGwClient.send(
      new CreateApiCommand({
        Name: API_NAME,
        ProtocolType: "HTTP",
        CorsConfiguration: {
          AllowOrigins: ["*"],
          AllowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
          AllowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
        },
      })
    );
    apiId = apiRes.ApiId || "";
    apiEndpoint = apiRes.ApiEndpoint || `https://${apiId}.execute-api.${REGION}.amazonaws.com`;

    // Create integration
    const intRes = await apiGwClient.send(
      new CreateIntegrationCommand({
        ApiId: apiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: lambdaArn,
        PayloadFormatVersion: "2.0",
      })
    );

    // Create routes
    await apiGwClient.send(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "$default",
        Target: `integrations/${intRes.IntegrationId}`,
      })
    );

    await apiGwClient.send(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "ANY /{proxy+}",
        Target: `integrations/${intRes.IntegrationId}`,
      })
    );

    // Create $default stage with AutoDeploy
    try {
      await apiGwClient.send(
        new CreateStageCommand({
          ApiId: apiId,
          StageName: "$default",
          AutoDeploy: true,
        })
      );
      console.log("Created $default stage with AutoDeploy enabled.");
    } catch (err: any) {
      console.log(`Stage notice: ${err.message}`);
    }

    // Grant API Gateway permission to invoke Lambda
    try {
      await lambdaClient.send(
        new AddPermissionCommand({
          FunctionName: functionName,
          StatementId: `apigateway-invoke-${Date.now()}`,
          Action: "lambda:InvokeFunction",
          Principal: "apigateway.amazonaws.com",
          SourceArn: `arn:aws:execute-api:${REGION}:${accountId}:${apiId}/*/*`,
        })
      );
    } catch {}

    console.log(`Created API Gateway HTTP API: ${apiEndpoint}`);
  }

  // 7. Summary
  console.log("\n=== Deployment Successful ===");
  console.log(`API Endpoint: ${apiEndpoint}`);
  console.log(`DynamoDB Table: ${TABLE_NAME}`);
  console.log(`Cognito User Pool ID: ${userPoolId}`);
  console.log(`Cognito Client ID: ${userPoolClientId}`);
  console.log(`Region: ${REGION}`);

  // Write deployment manifest
  fs.writeFileSync(
    "./backend/aws-exports.json",
    JSON.stringify(
      {
        apiEndpoint,
        tableName: TABLE_NAME,
        userPoolId,
        userPoolClientId,
        region: REGION,
      },
      null,
      2
    ),
    "utf-8"
  );
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});

import * as express from 'express';
import * as mongoose from 'mongoose';
import * as cors from 'cors';
import jwt = require('jsonwebtoken');

import { ApolloServerPluginLandingPageGraphQLPlayground } from 'apollo-server-core';
import { ApolloServer, AuthenticationError } from 'apollo-server-express';
import {
  GraphQLFormattedError, GraphQLError, execute, subscribe,
} from 'graphql';

import { graphqlUploadExpress } from 'graphql-upload';
import { createServer, Server } from 'http';
import { SubscriptionServer } from 'subscriptions-transport-ws';

import graphqlSchema from './graphql.schema';

const port = process.env.PORT || 4000;
const dbPath = process.env.MONGO_URL;

const options = {
  useCreateIndex: true,
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
};

function initSubscriptionServer(httpServer: Server, apolloServer: ApolloServer) {
  const subscriptionServer = new SubscriptionServer({
    schema: graphqlSchema,
    execute,
    subscribe,
    keepAlive: 15000,
    onOperation: (message, params, webSocket) => {
      const { authorization } = message.payload.auth;
      if (authorization) {
        const parts = authorization.split(' ');
        if (parts.length === 2) {
          const scheme = parts[0];
          const credentials = parts[1];
          if (/^Bearer$/i.test(scheme)) {
            const token = credentials;

            return jwt.verify(token, process.env.JWT_ACCESS_TOKEN, (err, decoded) => {
              if (err) { throw new AuthenticationError('You must logged in'); }
              return { ...params, context: { userId: decoded.userId } };
            });
          }
        }
      } else {
        throw new AuthenticationError('Missing auth token!');
      }
      return params;
    },
  }, {
    server: httpServer,
    path: apolloServer.graphqlPath,
  });
}

async function createApolloServer() {
  const app = express();

  app.use(cors({
    origin: process.env.CLIENT_DOMAIN,
  }));
  app.use(graphqlUploadExpress());
  await mongoose.connect(dbPath, options);
  console.log('MongoDB connected');

  const apolloServer = new ApolloServer({
    context: ({ req, res }) => ({ req, res }),
    schema: graphqlSchema,
    plugins: [
      ApolloServerPluginLandingPageGraphQLPlayground(),
    ],
    formatError: (error: GraphQLError): GraphQLFormattedError => {
      const { code, errorResponse = {} } = error.extensions;
      const {
        message,
      } = error;

      return {
        message,
        extensions: {
          code,
          errorResponse,
        },
      };
    },
  });
  await apolloServer.start();
  apolloServer.applyMiddleware({
    app,
  });

  const httpServer = createServer(app);

  await new Promise((resolve) => httpServer.listen(port, () => {
    resolve(true);
  }));
  console.log(`🚀 Server is listening on port ${port}`);
  initSubscriptionServer(httpServer, apolloServer);
}

createApolloServer();

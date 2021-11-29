import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import { AuthenticationError } from 'apollo-server-express';
import { defaultFieldResolver } from 'graphql';
import jwt = require('jsonwebtoken');

class AuthDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    const { resolve = defaultFieldResolver } = field;

    field.resolve = (...args) => {
      const [, , context] = args;
      if (context.req.headers.authorization) {
        const parts = context.req.headers.authorization.split(' ');
        if (parts.length === 2) {
          const scheme = parts[0];
          const credentials = parts[1];
          if (/^Bearer$/i.test(scheme)) {
            const token = credentials;
            jwt.verify(token, process.env.JWT_ACCESS_TOKEN, (err, decoded) => {
              if (err) { throw new AuthenticationError('You must logged in'); }
              context.req.userId = decoded.userId;
            });
          }
        }
      } else {
        throw new AuthenticationError('You must logged in');
      }
      return resolve.apply(this, args);
    };
  }
}

export default AuthDirective;

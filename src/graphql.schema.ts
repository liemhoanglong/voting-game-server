import { makeExecutableSchema } from '@graphql-tools/schema';
import { join } from 'path';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import AuthDirective from './directives/auth.directive';
import EmailDirective from './directives/email.directive';
import PasswordDirective from './directives/password.directive';
import NameDirective from './directives/name.directive';
import MinLengthDirective from './directives/minLength.directive';

const resolversArray = loadFilesSync(
  join(process.cwd(), 'src/**/*.resolver.*'),
);

const typesArray = loadFilesSync(join(process.cwd(), 'src/**/*.graphql'));

const schema = makeExecutableSchema({
  typeDefs: mergeTypeDefs(typesArray),
  schemaDirectives: {
    auth: AuthDirective,
    // email: EmailDirective,
    // password: PasswordDirective,
    // name: NameDirective,
    // minLength: MinLengthDirective,
  },
  resolvers: mergeResolvers(resolversArray),
});

export default schema;

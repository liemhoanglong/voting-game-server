// eslint-disable-next-line max-classes-per-file
import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import ValidatedScalar from './scalar/validate.scalar';
import { validatePassword } from '../utils/validation.util';

export default class PasswordDirective extends SchemaDirectiveVisitor {
  visitInputFieldDefinition(field) {
    this.wrapType(field);
  }

  visitFieldDefinition(field) {
    this.wrapType(field);
  }

  wrapType(field) {
    field.type = ValidatedScalar.create(field.type, validatePassword, 'Password');
  }
}

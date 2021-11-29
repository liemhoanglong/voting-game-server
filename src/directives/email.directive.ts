// eslint-disable-next-line max-classes-per-file
import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import isEmail from 'validator/lib/isEmail';
import ValidatedScalar from './scalar/validate.scalar';

export default class EmailDirective extends SchemaDirectiveVisitor {
  visitInputFieldDefinition(field) {
    this.wrapType(field);
  }

  visitFieldDefinition(field) {
    this.wrapType(field);
  }

  wrapType(field) {
    field.type = ValidatedScalar.create(field.type, isEmail, 'Email');
  }
}

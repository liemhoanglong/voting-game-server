// eslint-disable-next-line max-classes-per-file
import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import ValidatedScalar from './scalar/validate.scalar';
import { validateName } from '../utils/validation.util';

export default class NameDirective extends SchemaDirectiveVisitor {
  visitInputFieldDefinition(field) {
    this.wrapType(field);
  }

  visitFieldDefinition(field) {
    this.wrapType(field);
  }

  wrapType(field) {
    field.type = ValidatedScalar.create(field.type, validateName, 'Password');
  }
}

// eslint-disable-next-line max-classes-per-file
import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import ValidatedScalar from './scalar/validate.scalar';
import { validateMinLength } from '../utils/validation.util';

export default class MinLengthDirective extends SchemaDirectiveVisitor {
  visitInputFieldDefinition(field) {
    this.wrapType(field);
  }

  visitFieldDefinition(field) {
    this.wrapType(field);
  }

  wrapType(field) {
    field.type = ValidatedScalar.create(field.type, validateMinLength(this.args.min), `LengthAtLeast${this.args.min}`);
  }
}

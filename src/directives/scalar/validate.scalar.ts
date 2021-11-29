import { GraphQLScalarType, GraphQLNonNull } from 'graphql';

export default class ValidatedScalar extends GraphQLScalarType {
  static create(type, validator, validatedField) {
    if (type instanceof GraphQLNonNull
        && type.ofType instanceof GraphQLScalarType) {
      return new GraphQLNonNull(new this(type.ofType, validator, validatedField));
    }

    if (type instanceof GraphQLScalarType) {
      return new this(type, validator, validatedField);
    }

    throw new Error(`Type ${type} cannot be validated. Only scalars are accepted`);
  }

  private constructor(type, validator, validatedField) {
    super({
      name: `Validated${validatedField}`,

      serialize(value) {
        return value;
      },

      parseValue(value) {
        if (!validator(value)) {
          throw new Error(`Invalid ${validatedField}`);
        }
        return type.parseValue(value);
      },

      parseLiteral(ast) {
        return type.parseLiteral(ast);
      },
    });
  }
}

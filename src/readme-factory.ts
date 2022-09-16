import {
  Enum,
  File,
  Generator,
  getEnumByName,
  getTypeByName,
  Interface,
  isRequired,
  Method,
  Parameter,
  Property,
  ReturnType,
  Service,
  Type,
  warning,
} from 'basketry';
import { constant, kebab, pascal, snake, title } from 'case';

import { block, from, indent } from '@basketry/sorbet/lib/utils';

import { NamespacedSorbetOptions } from '@basketry/sorbet/lib/types';
import {
  buildInterfaceName,
  buildMethodName,
  buildParameterName,
  buildPropertyName,
  buildTypeName,
  buildTypeNamespace,
} from '@basketry/sorbet/lib/name-factory';
import { buildInterfaceDocsFilepath } from './name-factory';

export const generateDocs: Generator = (
  service,
  options?: NamespacedSorbetOptions,
) => {
  return new Builder(service, options).build();
};

class Builder {
  constructor(
    private readonly service: Service,
    private readonly options?: NamespacedSorbetOptions,
  ) {}

  build(): File[] {
    return this.service.interfaces.map((int) =>
      this.buildInterfaceDocsFile(int),
    );
  }

  private *warning(): Iterable<string> {
    yield '<!--';
    yield* warning(
      this.service,
      require('../package.json'),
      this.options || {},
    );
    yield '--->';
  }

  private methods(int: Interface): Method[] {
    return [...int.methods].sort((a, b) =>
      a.name.value.localeCompare(b.name.value),
    );
  }

  private types(int: Interface): Type[] {
    const foundTypes = new Set<Type>();

    for (const method of int.methods) {
      for (const param of method.parameters) {
        if (!param.isPrimitive) {
          const paramType = getTypeByName(this.service, param.typeName.value);
          if (!paramType) continue;
          for (const foundType of traverseType(this.service, paramType)) {
            foundTypes.add(foundType);
          }
        }
      }

      if (method.returnType && !method.returnType.isPrimitive) {
        const returnType = getTypeByName(
          this.service,
          method.returnType.typeName.value,
        );

        if (returnType) {
          for (const foundType of traverseType(this.service, returnType)) {
            foundTypes.add(foundType);
          }
        }
      }
    }

    return Array.from(foundTypes).sort((a, b) =>
      a.name.value.localeCompare(b.name.value),
    );
  }

  private enums(int: Interface): Enum[] {
    const foundEnums = new Set<Enum>();

    for (const method of int.methods) {
      for (const param of method.parameters) {
        if (!param.isPrimitive) {
          const paramEnum = getEnumByName(this.service, param.typeName.value);
          if (paramEnum) foundEnums.add(paramEnum);
        }
      }

      if (method.returnType && !method.returnType.isPrimitive) {
        const returnEnum = getEnumByName(
          this.service,
          method.returnType.typeName.value,
        );

        if (returnEnum) {
          foundEnums.add(returnEnum);
        }
      }
    }

    for (const type of this.types(int)) {
      for (const prop of type.properties) {
        if (!prop.isPrimitive) {
          const paramEnum = getEnumByName(this.service, prop.typeName.value);
          if (paramEnum) foundEnums.add(paramEnum);
        }
      }
    }

    return Array.from(foundEnums).sort((a, b) =>
      a.name.value.localeCompare(b.name.value),
    );
  }

  private buildInterfaceDocsFile(int: Interface): File {
    return {
      path: buildInterfaceDocsFilepath(int, this.service, this.options),
      contents: from(this.buildInterfaceDocs(int)),
    };
  }

  private *buildInterfaceDocs(int: Interface): Iterable<string> {
    const methods = this.methods(int);
    const types = this.types(int);
    const enums = this.enums(int);

    yield* this.warning();
    yield '';
    yield `# ${title(buildInterfaceName(int))}`;
    yield '';
    yield* this.buildToc(int);
    yield '';

    if (methods.length) {
      yield '## Methods';
      yield '';
      for (const method of methods) {
        yield* this.buildMethodDocs(method);
      }
    }
    if (types.length) {
      yield '## Types';
      yield '';
      for (const type of types) {
        yield* this.buildTypeDocs(type);
      }
    }
    if (enums.length) {
      yield '## Enums';
      yield '';
      for (const e of enums) {
        yield* this.buildEnumDocs(e);
      }
    }
  }

  private *buildToc(int: Interface): Iterable<string> {
    const methods = this.methods(int);
    const types = this.types(int);
    const enums = this.enums(int);

    if (methods.length) {
      yield '- Methods';
      for (const method of methods) {
        yield `  - [${buildMethodName(method)}](${anchor(
          buildMethodName(method),
        )})`;
      }
    }
    if (types.length) {
      yield '- Types';
      for (const type of types) {
        yield `  - [${pascal(type.name.value)}](${anchor(type.name.value)})`;
      }
    }
    if (enums.length) {
      yield '- Enums';
      for (const e of enums) {
        yield `  - [${pascal(e.name.value)}](${anchor(e.name.value)})`;
      }
    }
  }

  private *buildMethodDocs(method: Method): Iterable<string> {
    yield `### ${buildMethodName(method)}`;
    yield '';
    yield `\`${this.buildMethodDefinition(method)}\``;
    if (method.parameters.length) {
      yield '';
      for (const param of method.parameters) {
        yield this.buildParameter(param);
      }
    }
    if (method.returnType) {
      yield '';
      yield `Returns: ${this.buildLinkedTypeName(method.returnType)}${
        method.returnType.isArray ? '[]' : ''
      }`;
    }
    if (Array.isArray(method.description)) {
      for (const line of method.description) {
        yield '';
        yield line.value;
      }
    } else if (method.description) {
      yield '';
      yield method.description.value;
    }
    yield '';
  }

  private buildMethodDefinition(method: Method): string {
    const parameters = method.parameters.length
      ? `(${sortParameters(method.parameters)
          .map(
            (param) =>
              `${buildParameterName(param)}:${isRequired(param) ? '' : ' nil'}`,
          )
          .join(', ')})`
      : '';

    return `${buildMethodName(method)}${parameters}`;
  }

  private buildParameter(param: Parameter): string {
    return `- \`${buildParameterName(param)}\` ${this.buildLinkedTypeName(
      param,
    )}${isRequired(param) ? '' : ' (optional)'}${this.buildParameterDescription(
      param,
    )}`;
  }

  private buildLinkedTypeName(
    param: Parameter | Property | ReturnType,
  ): string {
    const typeName = this.buildTypeName(param, true);

    if (param.isPrimitive) {
      return `${typeName}${param.isArray ? '[]' : ''}`;
    } else {
      return `[${typeName}](${anchor(typeName)})${param.isArray ? '[]' : ''}`;
    }
  }

  private buildParameterDescription(param: Parameter | Property): string {
    if (!param.description) return '';

    if (Array.isArray(param.description)) {
      return ` - ${param.description.map((line) => line.value).join(' ')}`;
    }

    return ` - ${param.description.value}`;
  }

  private *buildTypeDocs(type: Type): Iterable<string> {
    yield `### ${pascal(type.name.value)}`;
    yield '';
    yield `\`${buildTypeNamespace(this.service, this.options)}::${pascal(
      type.name.value,
    )}\``;
    if (Array.isArray(type.description)) {
      for (const line of type.description) {
        yield '';
        yield line.value;
      }
    } else if (type.description) {
      yield '';
      yield type.description.value;
    }
    if (type.properties.length) {
      yield '';
      for (const prop of type.properties) {
        yield this.buildProperty(prop);
      }
    }
    yield '';
  }

  private buildProperty(prop: Property): string {
    return `- \`${buildPropertyName(prop)}\` ${this.buildLinkedTypeName(prop)}${
      isRequired(prop) ? '' : ' (optional)'
    }${this.buildParameterDescription(prop)}`;
  }

  private *buildEnumDocs(e: Enum): Iterable<string> {
    yield `### ${pascal(e.name.value)}`;
    yield '';
    yield `\`${buildTypeNamespace(this.service, this.options)}::${pascal(
      e.name.value,
    )}\``;
    if (e.values.length) {
      yield '';
      for (const value of e.values) {
        yield `- \`${value.value}\``;
      }
    }
    yield '';
  }

  private buildTypeName(
    type: Parameter | Property | ReturnType,
    skipArrayify: boolean = false,
  ): string {
    const fullyQualifiedName = buildTypeName({
      type,
      service: this.service,
      options: this.options,
      skipArrayify,
    });

    return type.isPrimitive
      ? fullyQualifiedName
      : fullyQualifiedName.substring(
          buildTypeNamespace(this.service, this.options).length + 2,
        );
  }
}

function sortParameters(parameters: Parameter[]): Parameter[] {
  return [...parameters].sort(
    (a, b) => (isRequired(a) ? 0 : 1) - (isRequired(b) ? 0 : 1),
  );
}

function* traverseType(service: Service, type: Type): Iterable<Type> {
  yield type;

  for (const prop of type.properties) {
    if (!prop.isPrimitive) {
      const subtype = getTypeByName(service, prop.typeName.value);
      if (subtype) yield* traverseType(service, subtype);
      // TODO: traverse unions
    }
  }
}

function anchor(name: string): string {
  return `#${name.toLocaleLowerCase().split(' ').join('-')}`;
}

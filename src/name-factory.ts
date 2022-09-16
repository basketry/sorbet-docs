import { Interface, Service } from 'basketry';
import { snake } from 'case';

import {
  buildInterfaceName,
  buildInterfaceNamespace,
} from '@basketry/sorbet/lib/name-factory';

import { NamespacedSorbetOptions } from '@basketry/sorbet/lib/types';

export function buildInterfaceDocsFilepath(
  int: Interface,
  service: Service,
  options?: NamespacedSorbetOptions,
): string[] {
  const namespace = buildInterfaceNamespace(service, options);

  return [
    ...namespace.split('::').map(snake),
    `${snake(buildInterfaceName(int))}.md`,
  ];
}

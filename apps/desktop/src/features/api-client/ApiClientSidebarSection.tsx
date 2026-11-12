import React from 'react';

import { ApiSidebarSection } from '../../components/api-client';

type ApiSidebarSectionProps = React.ComponentProps<typeof ApiSidebarSection>;

export type ApiClientSidebarSectionProps = Pick<
  ApiSidebarSectionProps,
  | 'onCreateCollection'
  | 'onSelectRequest'
  | 'onCreateRequest'
  | 'onEditCollection'
  | 'onDeleteCollection'
  | 'onEditRequest'
  | 'onDeleteRequest'
  | 'onDuplicateRequest'
>;

export const ApiClientSidebarSection: React.FC<ApiClientSidebarSectionProps> = (props) => (
  <ApiSidebarSection {...props} />
);

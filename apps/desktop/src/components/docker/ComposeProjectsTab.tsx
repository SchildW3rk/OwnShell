/**
 * Compose Projects Tab
 *
 * Lists all discovered Docker Compose projects with management actions
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileCode,
  RefreshCw,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  RotateCcw,
  Edit,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { Button } from '@ownshell/ui';
import { useComposeProjects } from '../../hooks/docker/useDockerQueries';
import { useComposeCommand, useRemoveComposeProject } from '../../hooks/docker/useDockerMutations';
import { NewComposeProjectModal } from './NewComposeProjectModal';
import { ComposeEditorModal } from './ComposeEditorModal';
import toast from 'react-hot-toast';

interface ComposeProjectsTabProps {
  sessionId: string;
}

interface ComposeProject {
  name: string;
  path: string;
  composePath: string;
  status: string;
  containerCount: number;
}

export const ComposeProjectsTab: React.FC<ComposeProjectsTabProps> = ({ sessionId }) => {
  const { t } = useTranslation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);

  const projectsQuery = useComposeProjects(sessionId);
  const composeCommandMutation = useComposeCommand(sessionId);
  const removeProjectMutation = useRemoveComposeProject(sessionId);

  const projects: ComposeProject[] = projectsQuery.data?.projects || [];
  const isLoading = projectsQuery.isLoading;

  const handleRefresh = () => {
    projectsQuery.refetch();
  };

  const handleProjectCreated = () => {
    projectsQuery.refetch();
  };

  const handleComposeUp = async (project: ComposeProject) => {
    composeCommandMutation.mutate(
      {
        projectPath: project.path,
        command: 'up',
        args: ['-d'], // Detached mode
      },
      {
        onSuccess: () => {
          toast.success(t('docker.compose.started', { name: project.name }));
          projectsQuery.refetch();
        },
        onError: (error: Error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const handleComposeDown = async (project: ComposeProject) => {
    const confirmed = confirm(
      t('docker.compose.stopConfirm', 'Stop all containers in "{{name}}"?', { name: project.name })
    );
    if (!confirmed) return;

    composeCommandMutation.mutate(
      {
        projectPath: project.path,
        command: 'down',
      },
      {
        onSuccess: () => {
          toast.success(t('docker.compose.stopped', { name: project.name }));
          projectsQuery.refetch();
        },
        onError: (error: Error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const handleComposeRestart = async (project: ComposeProject) => {
    composeCommandMutation.mutate(
      {
        projectPath: project.path,
        command: 'restart',
      },
      {
        onSuccess: () => {
          toast.success(t('docker.compose.restarted', { name: project.name }));
          projectsQuery.refetch();
        },
        onError: (error: Error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const handleRemoveProject = async (project: ComposeProject) => {
    const confirmed = confirm(
      t(
        'docker.compose.deleteConfirm',
        'Delete project "{{name}}" and all its containers? This will also remove the project directory.',
        { name: project.name }
      )
    );
    if (!confirmed) return;

    const removeVolumes = confirm(t('docker.compose.deleteVolumes', 'Also remove volumes?'));

    removeProjectMutation.mutate(
      {
        projectPath: project.path,
        removeVolumes,
      },
      {
        onSuccess: () => {
          toast.success(t('docker.compose.deleted', { name: project.name }));
          projectsQuery.refetch();
        },
        onError: (error: Error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const getStatusColor = (status: string) => {
    if (status.includes('running') || status.includes('up')) return 'text-green-400';
    if (status.includes('exited') || status.includes('down')) return 'text-muted-foreground';
    return 'text-yellow-400';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <FileCode className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            {t('docker.compose.projects', 'Compose Projects')}
          </h2>
          <span className="text-xs text-muted-foreground">({projects.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('docker.compose.newProject', 'New Project')}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('common.loading', 'Loading...')}</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {projectsQuery.error && (
          <div className="flex items-center justify-center h-64 px-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span>{projectsQuery.error.message}</span>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !projectsQuery.error && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 px-4 text-center">
            <FileCode className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-foreground font-medium mb-2">
              {t('docker.compose.noProjects', 'No Compose Projects')}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {t(
                'docker.compose.noProjectsHint',
                'Create a new project to get started with Docker Compose'
              )}
            </p>
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-1" />
              {t('docker.compose.newProject', 'New Project')}
            </Button>
          </div>
        )}

        {/* Projects Table */}
        {!isLoading && !projectsQuery.error && projects.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">
                    {t('docker.compose.name', 'Name')}
                  </th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">
                    {t('docker.compose.path', 'Path')}
                  </th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">
                    {t('docker.compose.status', 'Status')}
                  </th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">
                    {t('docker.compose.containers', 'Containers')}
                  </th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-medium">
                    {t('common.actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr
                    key={project.name}
                    className="border-b border-border hover:bg-[#2A2D2E] transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-primary" />
                        <span className="text-foreground font-medium">{project.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-muted-foreground text-xs font-mono">{project.path}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${getStatusColor(project.status)}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-foreground">{project.containerCount}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingProject(project.name)}
                          className="p-1.5 hover:bg-secondary rounded transition-colors"
                          title={t('docker.compose.edit', 'Edit')}
                        >
                          <Edit className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                        </button>
                        <button
                          onClick={() => handleComposeUp(project)}
                          className="p-1.5 hover:bg-secondary rounded transition-colors"
                          title={t('docker.compose.up', 'Start')}
                          disabled={composeCommandMutation.isPending}
                        >
                          <ArrowUp className="w-4 h-4 text-green-400 hover:text-green-300" />
                        </button>
                        <button
                          onClick={() => handleComposeDown(project)}
                          className="p-1.5 hover:bg-secondary rounded transition-colors"
                          title={t('docker.compose.down', 'Stop')}
                          disabled={composeCommandMutation.isPending}
                        >
                          <ArrowDown className="w-4 h-4 text-yellow-400 hover:text-yellow-300" />
                        </button>
                        <button
                          onClick={() => handleComposeRestart(project)}
                          className="p-1.5 hover:bg-secondary rounded transition-colors"
                          title={t('docker.compose.restart', 'Restart')}
                          disabled={composeCommandMutation.isPending}
                        >
                          <RotateCcw className="w-4 h-4 text-blue-400 hover:text-blue-300" />
                        </button>
                        <button
                          onClick={() => handleRemoveProject(project)}
                          className="p-1.5 hover:bg-secondary rounded transition-colors"
                          title={t('docker.compose.delete', 'Delete')}
                          disabled={removeProjectMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-red-400 hover:text-red-300" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <NewComposeProjectModal
          sessionId={sessionId}
          onClose={() => setShowCreateModal(false)}
          onProjectCreated={handleProjectCreated}
        />
      )}

      {editingProject && (
        <ComposeEditorModal
          sessionId={sessionId}
          projectName={editingProject}
          onClose={() => setEditingProject(null)}
          onStackUpdated={() => projectsQuery.refetch()}
        />
      )}
    </div>
  );
};

/**
 * New Compose Project Modal
 *
 * Create new Docker Compose projects from templates with inline YAML editing
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, FileCode, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@ownshell/ui';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { yaml } from '@codemirror/lang-yaml';
import toast from 'react-hot-toast';
import { composeTemplates, type ComposeTemplate } from '../../templates/docker-compose-templates';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { getCodeMirrorTheme } from '../../utils/codemirror-theme';

interface NewComposeProjectModalProps {
  sessionId: string;
  onClose: () => void;
  onProjectCreated?: () => void;
}

export const NewComposeProjectModal: React.FC<NewComposeProjectModalProps> = ({
  sessionId,
  onClose,
  onProjectCreated,
}) => {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const resolvedTheme = useThemeStore((state) => state.getResolvedTheme());
  const editorFontFamily = useAppearanceStore((state) => state.editorFontFamily);
  const editorFontSize = useAppearanceStore((state) => state.editorFontSize);

  const [step, setStep] = useState<'name' | 'template' | 'edit'>('name');
  const [projectName, setProjectName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ComposeTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize CodeMirror editor when in edit step
  useEffect(() => {
    if (step !== 'edit' || !editorRef.current || !selectedTemplate) return;

    // Get current theme
    const currentTheme = useThemeStore.getState().getResolvedTheme();
    const initialAppearance = useAppearanceStore.getState();

    const state = EditorState.create({
      doc: selectedTemplate.content,
      extensions: [
        basicSetup,
        yaml(),
        themeCompartment.current.of(
          getCodeMirrorTheme(currentTheme, {
            editorFontFamily: initialAppearance.editorFontFamily,
            editorFontSize: initialAppearance.editorFontSize,
          })
        ),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            height: '100%',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [step, selectedTemplate]);

  // Update theme when app theme changes
  useEffect(() => {
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        effects: themeCompartment.current.reconfigure(
          getCodeMirrorTheme(resolvedTheme, {
            editorFontFamily,
            editorFontSize,
          })
        ),
      });
    }
  }, [resolvedTheme, editorFontFamily, editorFontSize]);

  const handleNext = () => {
    if (step === 'name') {
      if (!projectName.trim()) {
        setError(t('docker.compose.projectNameRequired'));
        return;
      }
      // Validate project name (alphanumeric, hyphens, underscores only)
      if (!/^[a-zA-Z0-9_-]+$/.test(projectName)) {
        setError(t('docker.compose.invalidProjectName'));
        return;
      }
      setError(null);
      setStep('template');
    } else if (step === 'template') {
      if (!selectedTemplate) {
        setError(t('docker.compose.templateRequired'));
        return;
      }
      setError(null);
      setStep('edit');
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === 'template') {
      setStep('name');
    } else if (step === 'edit') {
      setStep('template');
    }
  };

  const handleCreate = async () => {
    if (!editorViewRef.current) return;

    const composeContent = editorViewRef.current.state.doc.toString();

    if (!composeContent.trim()) {
      toast.error(t('docker.compose.emptyContent'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const result = await window.electronAPI.docker.composeCreate(
        sessionId,
        projectName,
        composeContent
      );

      if (!result.success) {
        setError(result.error || t('docker.compose.createFailed'));
        setIsCreating(false);
        return;
      }

      toast.success(t('docker.compose.projectCreated', { name: projectName }));
      onProjectCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('docker.compose.createFailed'));
      setIsCreating(false);
    }
  };

  const handleTemplateSelect = (template: ComposeTemplate) => {
    setSelectedTemplate(template);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">
              {t('docker.compose.newProject')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface rounded transition-colors"
            disabled={isCreating}
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Project Name */}
          {step === 'name' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('docker.compose.projectName')}
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="my-app"
                  className="w-full px-3 py-2 bg-surface border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('docker.compose.projectNameHint')}
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Template Selection */}
          {step === 'template' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">
                  {t('docker.compose.selectTemplate')}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {composeTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateSelect(template)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        selectedTemplate?.id === template.id
                          ? 'border-border bg-secondary'
                          : 'border-border bg-surface hover:border-border'
                      }`}
                    >
                      <div className="font-semibold text-foreground mb-1">{template.name}</div>
                      <div className="text-sm text-muted-foreground">{template.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Edit YAML */}
          {step === 'edit' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('docker.compose.editYaml')}
                </label>
                <div
                  ref={editorRef}
                  className="border border-border rounded-md overflow-hidden"
                  style={{ height: '400px' }}
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('docker.compose.editYamlHint')}
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/50 rounded-md flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="text-sm text-muted-foreground">
            {step === 'name' && t('docker.compose.step', { current: 1, total: 3 })}
            {step === 'template' && t('docker.compose.step', { current: 2, total: 3 })}
            {step === 'edit' && t('docker.compose.step', { current: 3, total: 3 })}
          </div>
          <div className="flex gap-2">
            {step !== 'name' && (
              <Button variant="ghost" onClick={handleBack} disabled={isCreating}>
                {t('common.back')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} disabled={isCreating}>
              {t('common.cancel')}
            </Button>
            {step !== 'edit' ? (
              <Button onClick={handleNext}>{t('common.next')}</Button>
            ) : (
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('docker.compose.creating')}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('docker.compose.create')}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

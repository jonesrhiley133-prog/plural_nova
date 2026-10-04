import { useState } from 'react';
import type { AppearanceGlobal, BorderStyle } from '@pluralnova/shared';
import { useAppearance } from '../../core/appearance.js';
import { useTheme } from '../../core/theme.js';
import { useToast } from '../../core/toast.js';
import { Button, Card } from '../../ui/primitives.js';
import { FileButton, SelectField, SwitchRow } from '../../ui/forms.js';
import { ColorRow, GradientEditor, Group, RangeRow } from './controls.js';
import { uploadBackground } from './imageUpload.js';

/** Every global control. Anything left alone keeps following the base theme. */
export function GlobalPanel(): JSX.Element {
  const { state, setGlobal, clearGlobal, resetSection } = useAppearance();
  const { tokens } = useTheme();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const g = state.global;

  const color = (key: keyof AppearanceGlobal, label: string, fallback: string): JSX.Element => (
    <ColorRow
      label={label}
      value={g[key] as string | undefined}
      fallback={fallback}
      onChange={(value) => setGlobal({ [key]: value })}
      onClear={() => clearGlobal(key)}
    />
  );
  const range = (key: keyof AppearanceGlobal, label: string, fallback: number, opts: { max?: number; min?: number; unit?: string } = {}): JSX.Element => (
    <RangeRow
      label={label}
      value={g[key] as number | undefined}
      fallback={fallback}
      unit={opts.unit ?? '%'}
      {...(opts.max !== undefined ? { max: opts.max } : {})}
      {...(opts.min !== undefined ? { min: opts.min } : {})}
      onChange={(value) => setGlobal({ [key]: value })}
      onClear={() => clearGlobal(key)}
    />
  );

  return (
    <div className="stack">
      <Card title="Background" subtitle="The page behind everything">
        <div className="stack">
          {color('bgColor', 'Background colour', tokens.bg)}
          {range('bgOpacity', 'Background opacity', 100)}
          <Group title="Background gradient">
            <GradientEditor value={g.bgGradient} onChange={(value) => (value ? setGlobal({ bgGradient: value }) : clearGlobal('bgGradient'))} />
          </Group>
          <Group title="Background image">
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <FileButton
                label={uploading ? 'Compressing & uploading…' : g.bgImage ? 'Change image' : 'Add image'}
                accept="image/*"
                onFile={(file) => {
                  setUploading(true);
                  uploadBackground(file)
                    .then((url) => setGlobal({ bgImage: url }))
                    .catch((cause) => toast.fromError(cause, 'Could not add that image'))
                    .finally(() => setUploading(false));
                }}
              />
              {g.bgImage ? (
                <Button variant="ghost" size="sm" onClick={() => clearGlobal('bgImage')}>
                  Remove image
                </Button>
              ) : null}
            </div>
            <p className="tiny faint">Images are scaled down and compressed before upload, and only loaded while in use.</p>
            {g.bgImage ? (
              <>
                {range('bgImageOpacity', 'Image opacity', 40)}
                {range('bgBlur', 'Image blur', 0, { max: 40, unit: 'px' })}
                {range('bgSaturation', 'Image saturation', 100, { max: 200 })}
                {range('bgBrightness', 'Image brightness', 100, { min: 20, max: 200 })}
              </>
            ) : null}
          </Group>
        </div>
      </Card>

      <Card title="Surfaces" subtitle="Cards, panels and sheets">
        <div className="stack">
          {color('surfaceColor', 'Surface colour', tokens.surface)}
          {range('surfaceOpacity', 'Surface opacity', 100)}
          {range('surfaceBlur', 'Surface blur', 0, { max: 40, unit: 'px' })}
          <Group title="Surface gradient">
            <GradientEditor value={g.surfaceGradient} onChange={(value) => (value ? setGlobal({ surfaceGradient: value }) : clearGlobal('surfaceGradient'))} />
          </Group>
        </div>
      </Card>

      <Card title="Borders & shadows">
        <div className="stack">
          {color('borderColor', 'Border colour', tokens.border)}
          {range('borderOpacity', 'Border opacity', 100)}
          {range('borderWidth', 'Border thickness', 1, { max: 8, unit: 'px' })}
          <SelectField
            label="Border style"
            value={g.borderStyle ?? 'solid'}
            onChange={(value) => setGlobal({ borderStyle: value as BorderStyle })}
            options={['solid', 'dashed', 'dotted', 'double', 'none'].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))}
          />
          <SwitchRow label="Element shadows" checked={g.shadowEnabled !== false} onChange={(shadowEnabled) => setGlobal({ shadowEnabled })} />
          {g.shadowEnabled !== false ? (
            <>
              {range('shadowOpacity', 'Shadow opacity', 60)}
              {range('shadowBlur', 'Shadow blur', 24, { max: 80, unit: 'px' })}
            </>
          ) : null}
        </div>
      </Card>

      <Card title="Text & icons">
        <div className="stack">
          {color('textColor', 'Text colour', tokens.text)}
          {color('textSecondary', 'Secondary text colour', tokens.textMuted)}
          {color('textMuted', 'Muted text colour', tokens.textFaint)}
          {color('iconColor', 'Icon colour', tokens.text)}
        </div>
      </Card>

      <Card title="Accent & buttons">
        <div className="stack">
          {color('accent', 'Accent colour', tokens.accent)}
          {range('accentOpacity', 'Accent opacity', 100)}
          {color('buttonColor', 'Button colour', tokens.accent)}
          {range('buttonOpacity', 'Button opacity', 100)}
          {color('buttonBorder', 'Button border colour', tokens.border)}
          {range('buttonRadius', 'Button radius', 12, { max: 40, unit: 'px' })}
        </div>
      </Card>

      <Card title="Corner rounding">
        <div className="stack">
          {range('rounding', 'Overall rounding', 50)}
          {range('cardRadius', 'Card radius', 14, { max: 48, unit: 'px' })}
          {range('panelRadius', 'Panel radius', 20, { max: 64, unit: 'px' })}
          <p className="tiny faint">Card and panel radius override the overall level for just those surfaces.</p>
        </div>
      </Card>

      <Button variant="secondary" onClick={() => resetSection('global')}>
        Reset all global settings
      </Button>
    </div>
  );
}

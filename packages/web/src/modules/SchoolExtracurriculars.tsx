import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { StoredRecord } from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { useMemberScope } from '../core/memberScope.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, IconButton } from '../ui/primitives.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { MemberScopeChips } from '../ui/MemberScope.js';
import { MeetingDaysPicker } from './SchoolClasses.js';

/**
 * Extracurriculars — the roster of clubs, sports and everything else outside
 * of class, with hours logged against each one over time. Deliberately
 * simpler than Classes: no per-activity detail page, since there's no
 * grading detail or assignment history to drill into — edit, log hours and
 * delete all happen right from this one list.
 */
export default function SchoolExtracurriculars(): JSX.Element {
  const [params] = useSearchParams();
  const toast = useToast();
  const scope = useMemberScope();

  const items = useCollection('extracurriculars', {
    filter: (ec) => ec['archived'] !== true && (scope.isWholeSystem || ec['memberId'] === scope.memberId),
  });
  const logs = useCollection('extracurricularLogs');

  const hoursByActivity = useMemo(() => {
    const totals = new Map<string, number>();
    for (const log of logs.items) {
      const id = String(log['extracurricularId']);
      totals.set(id, (totals.get(id) ?? 0) + Number(log['hours'] ?? 0));
    }
    return totals;
  }, [logs.items]);

  const editor = useDialog<StoredRecord | null>();
  const confirm = useDialog<StoredRecord>();
  const logHours = useDialog<StoredRecord | null>();

  useEffect(() => {
    if (params.get('new') === '1') editor.show(null);
    if (params.get('logHours') === '1') logHours.show(null);
    // Only ever seeded from the URL the screen was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="stack stack--loose">
        <PageHeader
          title="Extracurriculars"
          description="Clubs, sports, and anything else outside of class."
          actions={
            <>
              <Button variant="ghost" icon="star" onClick={() => logHours.show(null)}>
                Log hours
              </Button>
              <Button variant="primary" icon="plus" onClick={() => editor.show(null)}>
                Add
              </Button>
            </>
          }
        />

        <MemberScopeChips scope={scope} />

        <AsyncContent
          loading={items.loading}
          error={items.error}
          items={items.items}
          onRetry={items.reload}
          empty={{
            icon: 'star',
            title: 'Nothing here yet',
            body: 'Add a club, sport, or anything else you do outside of class.',
            action: { label: 'Add an extracurricular', run: () => editor.show(null) },
          }}
        >
          {(list) => (
            <div className="grid" style={{ ['--grid-min' as never]: '240px' }}>
              {list.map((item) => {
                const hours = hoursByActivity.get(item.id) ?? 0;
                return (
                  <Card
                    key={item.id}
                    title={String(item['name'])}
                    subtitle={[item['role'], item['advisorOrCoach']].filter(Boolean).join(' · ') || undefined}
                    actions={
                      <span className="row row--nowrap">
                        <IconButton
                          icon="star"
                          label={`Log hours for ${String(item['name'])}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => logHours.show(item)}
                        />
                        <IconButton
                          icon="edit"
                          label={`Edit ${String(item['name'])}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => editor.show(item)}
                        />
                        <IconButton
                          icon="trash"
                          label={`Delete ${String(item['name'])}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => confirm.show(item)}
                        />
                      </span>
                    }
                  >
                    <div className="row row--between">
                      <Avatar
                        name={String(item['name'])}
                        color={(item['color'] as string) ?? null}
                        icon={(item['icon'] as string) ?? null}
                        size={36}
                        round
                      />
                      <span className="row" style={{ gap: 6 }}>
                        <strong>{Math.round(hours * 10) / 10}</strong>
                        <span className="tiny faint">hrs logged</span>
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </AsyncContent>
      </div>

      <Dialog
        open={editor.open}
        onClose={editor.hide}
        title={editor.value ? `Edit ${String(editor.value['name'])}` : 'New extracurricular'}
        wide
      >
        <ExtracurricularEditorForm
          key={editor.value?.id ?? 'new'}
          item={editor.value}
          onCancel={editor.hide}
          onSubmit={async (values) => {
            if (editor.value) await items.update(editor.value.id, values);
            else await items.create(values);
            toast.success('Saved');
            editor.hide();
          }}
        />
      </Dialog>

      <LogHoursDialog
        open={logHours.open}
        onClose={logHours.hide}
        initial={logHours.value ? { extracurricularId: logHours.value.id } : null}
        onSaved={() => {
          toast.success('Hours logged');
          logs.reload();
          logHours.hide();
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this extracurricular?"
        body="Hours already logged against it stay on record but lose their activity."
        onConfirm={async () => {
          if (!confirm.value) return;
          await items.remove(confirm.value.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}

/** Mirrors SchoolClasses.tsx's own ClassEditorForm — meetingDays is a JSON field, so it sits beside RecordForm, not inside it. */
function ExtracurricularEditorForm({
  item,
  onCancel,
  onSubmit,
}: {
  item: StoredRecord | null;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [meetingDays, setMeetingDays] = useState<string[]>(
    Array.isArray(item?.['meetingDays']) ? (item['meetingDays'] as string[]) : [],
  );

  return (
    <>
      <RecordForm
        collection="extracurriculars"
        record={item}
        omit={['meetingDays']}
        onSubmit={async (values) => onSubmit({ ...values, meetingDays })}
        onCancel={onCancel}
      />
      <MeetingDaysPicker value={meetingDays} onChange={setMeetingDays} />
    </>
  );
}

function LogHoursDialog({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { extracurricularId?: string } | null;
  onSaved: () => void;
}): JSX.Element {
  const logs = useCollection('extracurricularLogs', { enabled: false });

  return (
    <Dialog open={open} onClose={onClose} title="Log hours">
      <RecordForm
        collection="extracurricularLogs"
        initial={{ date: new Date().toISOString().slice(0, 10), ...(initial ?? {}) }}
        onSubmit={async (values) => {
          await logs.create(values);
          onSaved();
        }}
        onCancel={onClose}
      />
    </Dialog>
  );
}

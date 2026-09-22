import { useState } from 'react';
import { useAuth } from '../core/auth.js';
import { useCollection, useQuery } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton, Meter, Stat, Tabs } from '../ui/primitives.js';
import { AsyncContent, DescriptiveNote } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';
import { ColumnChart, RankedBars } from '../charts/index.js';
import { divergingColor } from '../charts/palette.js';
import type { StoredRecord } from '@pluralnova/shared';

/**
 * Finances.
 *
 * Accounts, transactions, budgets and savings goals. Nothing leaves the
 * account — these records are marked never-public at the schema level, so they
 * cannot appear on a shared profile even by accident.
 */

type Tab = 'overview' | 'transactions' | 'budgets' | 'goals' | 'accounts';

const KIND_META: Record<string, { icon: 'upload' | 'download' | 'repeat'; color: string }> = {
  income: { icon: 'upload', color: 'var(--positive)' },
  expense: { icon: 'download', color: 'var(--text-muted)' },
  transfer: { icon: 'repeat', color: 'var(--info)' },
};

interface FinanceStats {
  balances: { accountId: string; name: string; balance: number }[];
  totalBalance: number;
  incomeTotal: number;
  spendingTotal: number;
  byMonth: { label: string; value: number; key: string }[];
  byCategory: { category: string; amount: number }[];
  budgets: { id: string; category: string; limit: number; spent: number; remaining: number; share: number }[];
}

export default function Finances(): JSX.Element {
  const { settings } = useAuth();
  const dates = useDateFormat();
  const toast = useToast();
  const { term } = useI18n();

  const [tab, setTab] = useState<Tab>('overview');
  const stats = useQuery<FinanceStats>('/api/stats/finances', { months: 6 });

  const transactions = useCollection('transactions');
  const accounts = useCollection('financeAccounts');
  const budgets = useCollection('budgets');
  const goals = useCollection('savingsGoals');

  const editor = useDialog<{ collection: string; record: StoredRecord | null }>();
  const confirm = useDialog<{ collection: string; record: StoredRecord }>();

  const money = (amount: number): string =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: settings.currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);

  const collectionFor = (name: string) =>
    name === 'transactions'
      ? transactions
      : name === 'financeAccounts'
        ? accounts
        : name === 'budgets'
          ? budgets
          : goals;

  return (
    <>
      <PageHeader
        title="Finances"
        description="Kept entirely inside this account — never shown on a profile."
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() =>
              editor.show({
                collection:
                  tab === 'budgets' ? 'budgets' : tab === 'goals' ? 'savingsGoals' : tab === 'accounts' ? 'financeAccounts' : 'transactions',
                record: null,
              })
            }
          >
            Add
          </Button>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        label="Finance sections"
        options={(['overview', 'transactions', 'budgets', 'goals', 'accounts'] as const).map((option) => ({
          value: option,
          label: option[0]!.toUpperCase() + option.slice(1),
        }))}
      />

      {tab === 'overview' ? (
        <div className="stack">
          <div className="stat-grid">
            <Stat label="Balance" value={money(stats.data?.totalBalance ?? 0)} detail="across all accounts" />
            <Stat label="Income" value={money(stats.data?.incomeTotal ?? 0)} detail="last 6 months" />
            <Stat label="Spending" value={money(stats.data?.spendingTotal ?? 0)} detail="last 6 months" />
            <Stat label="Accounts" value={accounts.items.length} />
          </div>

          <Card>
            <ColumnChart
              title="Net movement by month"
              subtitle="Income minus spending"
              valueLabel="Net"
              points={(stats.data?.byMonth ?? []).map((bucket) => ({
                label: bucket.label,
                value: bucket.value,
                detail: bucket.key,
                color: divergingColor(bucket.value),
              }))}
              format={money}
              emptyMessage="No transactions recorded yet."
            />
          </Card>

          <Card>
            <RankedBars
              title="Where it went"
              subtitle="Spending by category"
              valueLabel="Amount"
              items={(stats.data?.byCategory ?? []).map((row, index) => ({
                id: row.category,
                label: row.category,
                value: row.amount,
                detail: money(row.amount),
                color: null,
              }))}
              format={money}
              emptyMessage="Nothing categorised yet."
            />
          </Card>

          {(stats.data?.budgets.length ?? 0) > 0 ? (
            <Card title="Budgets this month">
              <div className="stack">
                {stats.data!.budgets.map((budget) => (
                  <div key={budget.id}>
                    <div className="row row--between small" style={{ marginBottom: 4 }}>
                      <span>{budget.category}</span>
                      <span className="numeric muted">
                        {money(budget.spent)} of {money(budget.limit)}
                      </span>
                    </div>
                    <Meter
                      value={Math.min(budget.share, 1)}
                      max={1}
                      color={budget.share > 1 ? 'var(--critical)' : budget.share > 0.85 ? 'var(--caution)' : undefined}
                      label={`${budget.category}: ${Math.round(budget.share * 100)}% used`}
                    />
                    {budget.remaining < 0 ? (
                      <p className="tiny" style={{ color: 'var(--critical)', marginTop: 3 }}>
                        {money(Math.abs(budget.remaining))} over
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <DescriptiveNote>
            These are the transactions you entered. PluralNova does not connect to a bank and does
            not give financial advice.
          </DescriptiveNote>
        </div>
      ) : null}

      {tab === 'transactions' ? (
        <AsyncContent
          loading={transactions.loading}
          error={transactions.error}
          items={transactions.items}
          onRetry={transactions.reload}
          empty={{
            title: 'No transactions yet',
            body: 'Add what came in and what went out, and the charts follow.',
            icon: 'finance',
            action: { label: 'Add a transaction', run: () => editor.show({ collection: 'transactions', record: null }) },
          }}
        >
          {(items) => (
            <Card flush>
              <div className="list">
                {items.map((row) => {
                  const amount = Number(row['amount'] ?? 0);
                  const kind = KIND_META[String(row['kind'])] ?? KIND_META['expense']!;
                  return (
                    <div key={row.id} className="list-row">
                      <span
                        className="list-row__icon"
                        aria-hidden="true"
                        style={{
                          ['--row-icon-color' as never]: `color-mix(in srgb, ${kind.color} 15%, transparent)`,
                          ['--row-icon-fg' as never]: kind.color,
                        }}
                      >
                        <Icon name={kind.icon} size={16} />
                      </span>
                      <span className="list-row__body">
                        <span className="list-row__title">{String(row['description'])}</span>
                        <span className="list-row__meta">
                          <span>{dates.date(String(row['occurredAt']))}</span>
                          {row['category'] ? <Chip>{String(row['category'])}</Chip> : null}
                          {row['accountId'] ? (
                            <span className="faint">
                              {String(accounts.items.find((account) => account.id === row['accountId'])?.['name'] ?? '')}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="list-row__trailing">
                        <span
                          className="numeric"
                          style={{ color: amount >= 0 ? 'var(--positive)' : 'var(--text)' }}
                        >
                          {amount >= 0 ? '+' : ''}
                          {money(amount)}
                        </span>
                        <IconButton
                          icon="edit"
                          label="Edit transaction"
                          variant="ghost"
                          size="sm"
                          onClick={() => editor.show({ collection: 'transactions', record: row })}
                        />
                        <IconButton
                          icon="trash"
                          label="Delete transaction"
                          variant="ghost"
                          size="sm"
                          onClick={() => confirm.show({ collection: 'transactions', record: row })}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </AsyncContent>
      ) : null}

      {tab === 'budgets' ? (
        <AsyncContent
          loading={budgets.loading}
          error={budgets.error}
          items={budgets.items}
          onRetry={budgets.reload}
          empty={{
            title: 'No budgets set',
            body: 'A budget is a line to notice, not a rule to obey.',
            icon: 'finance',
            action: { label: 'Add a budget', run: () => editor.show({ collection: 'budgets', record: null }) },
          }}
        >
          {(items) => (
            <div className="grid" style={{ ['--grid-min' as never]: '250px' }}>
              {items.map((budget) => {
                const progress = stats.data?.budgets.find((row) => row.id === budget.id);
                const limit = Number(budget['limitAmount'] ?? 0);
                const spent = progress?.spent ?? 0;
                return (
                  <Card
                    key={budget.id}
                    title={String(budget['category'])}
                    subtitle="this month"
                    actions={
                      <>
                        <IconButton
                          icon="edit"
                          label="Edit budget"
                          variant="ghost"
                          size="sm"
                          onClick={() => editor.show({ collection: 'budgets', record: budget })}
                        />
                        <IconButton
                          icon="trash"
                          label="Delete budget"
                          variant="ghost"
                          size="sm"
                          onClick={() => confirm.show({ collection: 'budgets', record: budget })}
                        />
                      </>
                    }
                  >
                    <div className="row row--between small" style={{ marginBottom: 6 }}>
                      <span className="numeric">{money(spent)}</span>
                      <span className="numeric muted">of {money(limit)}</span>
                    </div>
                    <Meter
                      value={spent}
                      max={limit || 1}
                      color={spent > limit ? 'var(--critical)' : undefined}
                      label={`${String(budget['category'])}: ${money(spent)} of ${money(limit)} spent this month`}
                    />
                    {progress && progress.remaining < 0 ? (
                      <p className="tiny" style={{ color: 'var(--critical)', marginTop: 6 }}>
                        {money(Math.abs(progress.remaining))} over
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </AsyncContent>
      ) : null}

      {tab === 'goals' ? (
        <AsyncContent
          loading={goals.loading}
          error={goals.error}
          items={goals.items}
          onRetry={goals.reload}
          empty={{
            title: 'No savings goals',
            body: 'Something you are putting money aside for.',
            icon: 'finance',
            action: { label: 'Add a goal', run: () => editor.show({ collection: 'savingsGoals', record: null }) },
          }}
        >
          {(items) => (
            <div className="grid" style={{ ['--grid-min' as never]: '250px' }}>
              {items.map((goal) => {
                const saved = Number(goal['savedAmount'] ?? 0);
                const target = Number(goal['targetAmount'] ?? 1);
                return (
                  <Card
                    key={goal.id}
                    title={String(goal['name'])}
                    subtitle={goal['targetDate'] ? `by ${dates.date(String(goal['targetDate']))}` : undefined}
                    actions={
                      <IconButton
                        icon="edit"
                        label="Edit goal"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.show({ collection: 'savingsGoals', record: goal })}
                      />
                    }
                  >
                    <div className="row row--between small" style={{ marginBottom: 6 }}>
                      <span className="numeric">{money(saved)}</span>
                      <span className="numeric muted">of {money(target)}</span>
                    </div>
                    <Meter
                      value={saved}
                      max={target}
                      color={(goal['color'] as string) || undefined}
                      label={`${String(goal['name'])}: ${Math.round((saved / target) * 100)}%`}
                    />
                  </Card>
                );
              })}
            </div>
          )}
        </AsyncContent>
      ) : null}

      {tab === 'accounts' ? (
        <SimpleList
          collection={accounts}
          title="name"
          subtitle={(row) =>
            money(stats.data?.balances.find((balance) => balance.accountId === row.id)?.balance ?? 0)
          }
          emptyTitle="No accounts yet"
          emptyBody="An account is just a bucket to put transactions in."
          onEdit={(row) => editor.show({ collection: 'financeAccounts', record: row })}
          onDelete={(row) => confirm.show({ collection: 'financeAccounts', record: row })}
          onAdd={() => editor.show({ collection: 'financeAccounts', record: null })}
        />
      ) : null}

      <Dialog
        open={editor.open}
        onClose={editor.hide}
        title={editor.value?.record ? 'Edit' : 'Add'}
      >
        {editor.value ? (
          <RecordForm
            collection={editor.value.collection}
            record={editor.value.record}
            initial={editor.value.collection === 'transactions' ? { occurredAt: new Date().toISOString() } : {}}
            onSubmit={async (values) => {
              const target = collectionFor(editor.value!.collection);
              if (editor.value!.record) await target.update(editor.value!.record.id, values);
              else await target.create(values);
              toast.success('Saved');
              stats.reload();
              editor.hide();
            }}
            onCancel={editor.hide}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this record?"
        body="It is removed from the list and from the totals."
        onConfirm={async () => {
          if (!confirm.value) return;
          await collectionFor(confirm.value.collection).remove(confirm.value.record.id);
          toast.success('Deleted');
          stats.reload();
        }}
      />
    </>
  );
}

function SimpleList({
  collection,
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  onEdit,
  onDelete,
  onAdd,
}: {
  collection: ReturnType<typeof useCollection>;
  title: string;
  subtitle: (row: StoredRecord) => string;
  emptyTitle: string;
  emptyBody: string;
  onEdit: (row: StoredRecord) => void;
  onDelete: (row: StoredRecord) => void;
  onAdd: () => void;
}): JSX.Element {
  return (
    <AsyncContent
      loading={collection.loading}
      error={collection.error}
      items={collection.items}
      onRetry={collection.reload}
      empty={{ title: emptyTitle, body: emptyBody, icon: 'finance', action: { label: 'Add', run: onAdd } }}
    >
      {(items) => (
        <Card flush>
          <div className="list">
            {items.map((row) => (
              <div key={row.id} className="list-row">
                <span className="list-row__body">
                  <span className="list-row__title">{String(row[title])}</span>
                  <span className="list-row__meta numeric">{subtitle(row)}</span>
                </span>
                <span className="list-row__trailing">
                  <IconButton icon="edit" label="Edit" variant="ghost" size="sm" onClick={() => onEdit(row)} />
                  <IconButton icon="trash" label="Delete" variant="ghost" size="sm" onClick={() => onDelete(row)} />
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </AsyncContent>
  );
}

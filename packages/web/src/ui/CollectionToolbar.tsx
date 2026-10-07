import { useMemo, useState, type ReactNode } from 'react';
import { requireCollection, type FieldDef, type StoredRecord } from '@pluralnova/shared';
import { Button } from './primitives.js';

/**
 * Filters and sorting for a collection screen, derived from the registry.
 *
 * A facet is just a field name: an enum offers its options, a boolean offers
 * "yes", tags and free-text categories offer the values actually in use, and
 * member references offer the members. Nothing here knows which collection it
 * is filtering, so every list gets the same behaviour for the cost of one line.
 */

export interface FilterSpec {
  field: string;
  /** Overrides the field's own label. */
  label?: string;
}

export interface SortSpec {
  id: string;
  label: string;
  compare: (a: StoredRecord, b: StoredRecord) => number;
}

export interface Facets {
  /** The toolbar to render. */
  toolbar: ReactNode;
  filter: (record: StoredRecord) => boolean;
  sort: ((a: StoredRecord, b: StoredRecord) => number) | undefined;
  active: boolean;
}

interface Option {
  value: string;
  label: string;
}

function distinctValues(all: StoredRecord[], field: FieldDef): Option[] {
  const seen = new Set<string>();
  for (const record of all) {
    const value = record[field.name];
    if (Array.isArray(value)) value.forEach((item) => item && seen.add(String(item)));
    else if (typeof value === 'string' && value.trim()) seen.add(value.trim());
  }
  return [...seen].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
}

function optionsFor(
  all: StoredRecord[],
  field: FieldDef,
  members: Map<string, StoredRecord>,
): Option[] {
  if (field.kind === 'enum') return (field.options ?? []).map((o) => ({ value: o.value, label: o.label }));
  if (field.kind === 'bool') return [{ value: '1', label: 'Yes' }];
  if (field.kind === 'ref' || field.kind === 'refs') {
    const used = new Set<string>();
    for (const record of all) {
      const value = record[field.name];
      (Array.isArray(value) ? value : [value]).forEach((id) => id && used.add(String(id)));
    }
    return [...used]
      .map((id) => ({ value: id, label: String(members.get(id)?.['name'] ?? '') }))
      .filter((option) => option.label)
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  return distinctValues(all, field);
}

function matches(record: StoredRecord, field: FieldDef, wanted: string): boolean {
  const value = record[field.name];
  if (field.kind === 'bool') return value === true;
  if (Array.isArray(value)) return value.map(String).includes(wanted);
  return String(value ?? '') === wanted;
}

export function useFacets(
  collection: string,
  all: StoredRecord[],
  members: Map<string, StoredRecord>,
  filters: readonly FilterSpec[] = [],
  sorts: readonly SortSpec[] = [],
): Facets {
  const definition = requireCollection(collection);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sortId, setSortId] = useState<string>(sorts[0]?.id ?? '');

  const fields = useMemo(
    () =>
      filters
        .map((spec) => {
          const field = definition.fields.find((candidate) => candidate.name === spec.field);
          return field ? { spec, field } : null;
        })
        .filter((entry): entry is { spec: FilterSpec; field: FieldDef } => entry !== null),
    [definition, filters],
  );

  const active = Object.values(values).some(Boolean);

  const filter = useMemo(
    () => (record: StoredRecord) =>
      fields.every(({ field }) => {
        const wanted = values[field.name];
        return !wanted || matches(record, field, wanted);
      }),
    [fields, values],
  );

  const sort = sorts.find((candidate) => candidate.id === sortId)?.compare;

  const toolbar =
    fields.length === 0 && sorts.length < 2 ? null : (
      <div className="row" style={{ marginBottom: 'var(--space-4)', gap: 'var(--space-2)' }} role="group" aria-label="Filters and sorting">
        {fields.map(({ spec, field }) => {
          const options = optionsFor(all, field, members);
          if (options.length === 0) return null;
          const isBool = field.kind === 'bool';
          if (isBool) {
            const on = values[field.name] === '1';
            return (
              <Button
                key={field.name}
                size="sm"
                variant={on ? 'primary' : 'ghost'}
                aria-pressed={on}
                onClick={() => setValues((prev) => ({ ...prev, [field.name]: on ? '' : '1' }))}
              >
                {spec.label ?? field.label}
              </Button>
            );
          }
          return (
            <select
              key={field.name}
              className="select"
              style={{ width: 'auto', minWidth: 120 }}
              aria-label={`Filter by ${(spec.label ?? field.label).toLowerCase()}`}
              value={values[field.name] ?? ''}
              onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
            >
              <option value="">{`All · ${spec.label ?? field.label}`}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        })}
        {sorts.length > 1 ? (
          <select
            className="select"
            style={{ width: 'auto', minWidth: 120 }}
            aria-label="Sort by"
            value={sortId}
            onChange={(event) => setSortId(event.target.value)}
          >
            {sorts.map((option) => (
              <option key={option.id} value={option.id}>
                {`Sort · ${option.label}`}
              </option>
            ))}
          </select>
        ) : null}
        {active ? (
          <Button size="sm" variant="ghost" onClick={() => setValues({})}>
            Clear filters
          </Button>
        ) : null}
      </div>
    );

  return { toolbar, filter, sort, active };
}

import { type ConditionalBatchWritableField } from "../../../shared/conditionalBatchRules";

import { resolveConditionalBatchNumberPresentation } from "./conditionalBatchPresentation";

import { CheckboxField } from "./ui/CheckboxField";

import { FontSelect } from "./FontSelect";

import { ColorField } from "./ColorField";

import { NumberField } from "./ui/NumberField";

import { SegmentedControl } from "./ui/SegmentedControl";

import styles from "./ConditionalBatchEditor.module.css";

export function PatchFontValue({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (value: string | null | undefined) => void;
}) {
  const enabled = value !== undefined;
  return (
    <div className={styles.patchField}>
      <CheckboxField
        checked={enabled}
        label="글꼴"
        onCheckedChange={(checked) => onChange(checked ? "" : undefined)}
      />
      {enabled ? (
        <div className={styles.patchValue}>
          <FontSelect
            ariaLabel="부분 서식 글꼴"
            disabled={value === null}
            value={typeof value === "string" ? value || undefined : undefined}
            onChange={(fontFamily) => onChange(fontFamily ?? "")}
          />
          <CheckboxField
            checked={value === null}
            label="초기화"
            onCheckedChange={(checked) => onChange(checked ? null : "")}
          />
        </div>
      ) : null}
    </div>
  );
}

export function PatchColorValue({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string | null | undefined) => void;
  value: string | null | undefined;
}) {
  const enabled = value !== undefined;
  return (
    <div className={styles.patchField}>
      <CheckboxField
        checked={enabled}
        label={label}
        onCheckedChange={(checked) => onChange(checked ? "#000000" : undefined)}
      />
      {enabled ? (
        <div className={styles.patchValue}>
          <ColorField
            label={label}
            labelHidden
            disabled={value === null}
            value={typeof value === "string" ? value : "#000000"}
            onChange={onChange}
          />
          <CheckboxField
            checked={value === null}
            label="초기화"
            onCheckedChange={(checked) => onChange(checked ? null : "#000000")}
          />
        </div>
      ) : null}
    </div>
  );
}

export function PatchBoolean({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (value: boolean | null | undefined) => void;
}) {
  const enabled = value !== undefined;
  return (
    <div className={styles.patchField}>
      <CheckboxField
        checked={enabled}
        label={label}
        onCheckedChange={(checked) => onChange(checked ? true : undefined)}
      />
      {enabled ? (
        <SegmentedControl
          ariaLabel={`${label} 값`}
          singleRow
          value={value === true ? "on" : value === false ? "off" : "clear"}
          options={[
            { id: "on", label: "켜기" },
            { id: "off", label: "끄기" },
            { id: "clear", label: "초기화" },
          ]}
          onChange={(next) =>
            onChange(next === "on" ? true : next === "off" ? false : null)
          }
        />
      ) : null}
    </div>
  );
}

export function PatchValue({
  label,
  value,
  field,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  field: ConditionalBatchWritableField;
  onChange: (value: number | null | undefined) => void;
}) {
  const enabled = value !== undefined;
  const presentation = resolveConditionalBatchNumberPresentation(
    field,
    value ?? 1,
  );
  return (
    <div className={styles.patchField}>
      <CheckboxField
        checked={enabled}
        label={label}
        onCheckedChange={(checked) => onChange(checked ? 1 : undefined)}
      />
      {enabled ? (
        <div className={styles.patchValue}>
          <NumberField
            ariaLabel={`${label} 부분 서식 값`}
            variant="framed"
            min={presentation.min}
            max={presentation.max}
            step={presentation.step}
            precision={6}
            unit={presentation.unit}
            disabled={value === null}
            value={presentation.value}
            onValueChange={(next) => onChange(presentation.toStoredValue(next))}
          />
          <CheckboxField
            checked={value === null}
            label="초기화"
            onCheckedChange={(checked) => onChange(checked ? null : 1)}
          />
        </div>
      ) : null}
    </div>
  );
}

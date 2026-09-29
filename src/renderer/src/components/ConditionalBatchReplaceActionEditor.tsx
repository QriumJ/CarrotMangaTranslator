import {
  type ConditionalBatchActionV2,
  type ConditionalBatchReplaceTextActionV2,
} from "../../../shared/conditionalBatchRules";

import { Select } from "./ui/Select";

import { Field } from "./ui/Field";

import { ConditionalPatternBuilder } from "./ConditionalPatternBuilder";

import styles from "./ConditionalBatchEditor.module.css";

export function ReplaceActionEditor({
  action,
  sampleText,
  onChange,
}: {
  action: ConditionalBatchReplaceTextActionV2;
  sampleText?: string;
  onChange: (action: ConditionalBatchActionV2) => void;
}) {
  return (
    <>
      <div className={styles.actionOptions}>
        <Field as="div" label="대상">
          <Select
            ariaLabel="치환할 글"
            value={action.target}
            options={[
              { value: "translatedText", label: "번역문" },
              { value: "sourceText", label: "원문" },
              { value: "both", label: "원문과 번역문" },
            ]}
            onValueChange={(target) =>
              onChange({
                ...action,
                target: target as ConditionalBatchReplaceTextActionV2["target"],
              })
            }
          />
        </Field>
        <Field as="div" label="바꿀 범위">
          <Select
            ariaLabel="바꿀 범위"
            value={action.allOccurrences ? "all" : "first"}
            options={[
              { value: "all", label: "모든 일치 항목" },
              { value: "first", label: "첫 번째만" },
            ]}
            onValueChange={(value) =>
              onChange({ ...action, allOccurrences: value === "all" })
            }
          />
        </Field>
      </div>
      <ConditionalPatternBuilder
        matcher={action.matcher}
        replacement={action.replacement}
        sampleText={sampleText}
        onChangeMatcher={(matcher) => onChange({ ...action, matcher })}
        onChangeReplacement={(replacement) =>
          onChange({ ...action, replacement })
        }
        onSwitchToRaw={(matcher, replacement) =>
          onChange({
            ...action,
            matcher,
            replacement: replacement ?? action.replacement,
          })
        }
        onSwitchToVisual={(matcher, replacement) =>
          onChange({
            ...action,
            matcher,
            replacement: replacement ?? action.replacement,
          })
        }
      />
    </>
  );
}

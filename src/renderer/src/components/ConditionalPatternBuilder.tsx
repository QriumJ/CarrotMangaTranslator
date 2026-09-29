import React from "react";

import {
  collectCaptureIds,
  createConditionalLiteralMatcher,
} from "../../../shared/conditionalTextPattern";

import { Button } from "./ui/Button";
import { CheckboxField } from "./ui/CheckboxField";

import styles from "./ConditionalBatchEditor.module.css";

import {
  AdvancedPatternCode,
  RawPatternEditor,
} from "./ConditionalPatternCodeEditor";

import { PatternLane } from "./ConditionalPatternLane";

import { ReplacementLane } from "./ConditionalReplacementLane";
import type { PatternBuilderProps } from "./conditionalPatternEditorModel";

export function ConditionalPatternBuilder({
  matcher,
  replacement,
  sampleText,
  onChangeMatcher,
  onChangeReplacement,
  onSwitchToRaw,
  onSwitchToVisual,
}: PatternBuilderProps): React.JSX.Element {
  if (matcher.mode === "regex") {
    return (
      <RawPatternEditor
        matcher={matcher}
        replacement={replacement}
        onChangeMatcher={onChangeMatcher}
        onChangeReplacement={onChangeReplacement}
        onSwitchToRaw={onSwitchToRaw}
        onSwitchToVisual={onSwitchToVisual}
      />
    );
  }

  const captureIds = [...collectCaptureIds(matcher)];
  const captureLabels = new Map(
    captureIds.map((captureId, index) => [captureId, `기억 ${index + 1}`]),
  );
  return (
    <div className={styles.patternBuilder}>
      <PatternLane
        label="찾기"
        nodes={matcher.nodes}
        captureLabels={captureLabels}
        onChange={(nodes) => onChangeMatcher({ ...matcher, nodes })}
      />
      {replacement && onChangeReplacement ? (
        <ReplacementLane
          replacement={replacement}
          captureIds={captureIds}
          captureLabels={captureLabels}
          onChange={onChangeReplacement}
        />
      ) : null}
      <div className={styles.patternOptions}>
        <CheckboxField
          checked={matcher.caseSensitive}
          label="대소문자 구분"
          onCheckedChange={(caseSensitive) =>
            onChangeMatcher({ ...matcher, caseSensitive })
          }
        />
        {sampleText ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onChangeMatcher(
                createConditionalLiteralMatcher(
                  sampleText,
                  matcher.caseSensitive,
                ),
              )
            }
          >
            현재 말풍선에서 가져오기
          </Button>
        ) : null}
      </div>
      <AdvancedPatternCode
        matcher={matcher}
        replacement={replacement}
        onChangeMatcher={onChangeMatcher}
        onChangeReplacement={onChangeReplacement}
        onSwitchToRaw={onSwitchToRaw}
      />
    </div>
  );
}

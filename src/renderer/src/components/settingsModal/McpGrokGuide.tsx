import React from "react";
import connectorsImage from "../../assets/images/mcp-grok/grok-connectors.png";
import newConnectorImage from "../../assets/images/mcp-grok/grok-new-connector.png";
import formImage from "../../assets/images/mcp-grok/grok-connector-form.png";
import { McpCliSteps, McpCommandCopy } from "./McpClaudeGuide";
import { GuideImage } from "./McpGuideImage";
import styles from "./McpSettingsPanel.module.css";

export function GrokGuide({ url }: { url?: string | null }) {
  return (
    <ol className={`${styles.setupSteps} ${styles.visualSteps}`}>
      <li>
        <strong>플러그인 → 새 커넥터</strong>
        <p>
          아래 Grok 커넥터 열기를 누르고 로그인하세요. 커넥터 탭 오른쪽 위의 새
          커넥터(New Connector)를 누르세요.
        </p>
        <GuideImage
          src={connectorsImage}
          title="Grok 커넥터 탭의 새 커넥터 버튼"
        />
      </li>
      <li>
        <strong>맞춤 모드 선택</strong>
        <p>새 커넥터 창 맨 위의 맞춤 모드(Custom)를 선택하세요.</p>
        <GuideImage
          src={newConnectorImage}
          title="새 커넥터 창의 맞춤 모드"
          kind="menu"
        />
      </li>
      <li>
        <strong>이름·서버 URL 입력</strong>
        <dl className={styles.guideFields}>
          <dt>이름</dt>
          <dd>당근망가번역기</dd>
          <dt>서버 URL</dt>
          <dd className={styles.address}>{url ?? "MCP를 켜면 표시됩니다."}</dd>
        </dl>
        <p>
          위 주소 복사로 /mcp까지 붙여 넣고 커넥터 추가를 누르세요. 입력란의
          /sse 예시 주소로 바꾸지 마세요.
        </p>
        <GuideImage
          src={formImage}
          title="맞춤형 커넥터 이름·서버 URL 입력 · URL 입력 전"
          kind="form"
        />
      </li>
      <li>
        <strong>OAuth 인증 → 같은 코드 확인 후 승인</strong>
        <p>
          연결 과정에서 열린 브라우저와 당근 앱의 확인 코드·요청 권한을 비교하고
          당근에서 승인하세요. 조직 계정에서 커넥터가 제한되면 관리자에게 허용을
          요청하세요.
        </p>
      </li>
      <li>
        <strong>새 대화에서 작업 요청</strong>
        <p>
          당근과 Tailscale을 켜 둔 채 Grok에서 당근 도구로 보관함을 조회한 뒤 한
          페이지 번역을 요청하세요.
        </p>
        <blockquote className={styles.example}>
          “당근 보관함의 작품과 화 목록을 보여줘. 아직 수정하지 마.”
        </blockquote>
      </li>
    </ol>
  );
}

export function GrokBuildGuide({
  url,
  busy,
  run,
}: {
  url?: string | null;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <McpCliSteps
      registerTitle="Grok Build에 서버 등록"
      registration={
        <>
          <p className={styles.note}>
            Grok Build CLI가 설치된 PC의 터미널에서 실행하세요. 설치 안내는 아래
            공식 연결 문서의 Getting Started에서 확인할 수 있습니다.
          </p>
          <McpCommandCopy
            commands={
              url
                ? `grok mcp add --transport http carrot ${JSON.stringify(url)}\ngrok mcp list`
                : null
            }
            busy={busy}
            run={run}
          />
        </>
      }
      approveTitle="/mcps에서 인증 후 승인"
      approveNote="grok을 실행해 계정에 로그인하세요. /mcps에서 carrot을 선택하고 i로 OAuth 인증을 시작하세요. 최초 사용 시 자동으로 열릴 수도 있습니다. 브라우저와 당근 앱의 코드·권한을 확인하고 당근에서 승인하세요."
      requestNote="연결 후 Grok Build에서 새 대화를 여세요. 당근과 Tailscale은 켜 두세요. 연결이 안 되면 터미널에서 grok mcp doctor carrot으로 진단하세요."
    />
  );
}

import React from "react";
import { mcpGateway } from "../../api/mcpGateway";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Tabs } from "../ui/Tabs";
import sidebarImage from "../../assets/images/mcp-chatgpt/plugins-sidebar.png";
import addImage from "../../assets/images/mcp-chatgpt/add-mcp-app.png";
import createImage from "../../assets/images/mcp-chatgpt/create-app-redacted.png";
import installedImage from "../../assets/images/mcp-chatgpt/installed-plugin.png";
import manageImage from "../../assets/images/mcp-chatgpt/manage-plugin.png";
import permissionSettingsImage from "../../assets/images/mcp-chatgpt/permission-settings.png";
import permissionsImage from "../../assets/images/mcp-chatgpt/tool-permissions.png";
import styles from "./McpSettingsPanel.module.css";

export function McpTailscaleGuide({
  busy,
  run,
}: {
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <div className={styles.body}>
      <ol className={styles.setupSteps} aria-label="Tailscale 연결 순서">
        <li>
          <strong>Tailscale 설치</strong>
          <p className={styles.note}>당근을 실행하는 PC에 설치하세요.</p>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void run(() => mcpGateway.openMcpHelp("tailscale"))}
          >
            Tailscale 다운로드
          </Button>
        </li>
        <li>
          <strong>로그인·PC 연결</strong>
          <p className={styles.note}>
            Windows: 시계 옆 숨겨진 아이콘(위쪽 화살표) → Tailscale 우클릭.
            macOS: 상단 메뉴 막대 → Tailscale.
          </p>
          <p className={styles.note}>
            Log in(로그인) → 브라우저 로그인 → 기기 연결 화면에서 Connect(연결).
            Tailscale 메뉴가 연결된 상태인지 확인하세요.
          </p>
        </li>
        <li>
          <strong>MCP 켜기</strong>
          <p className={styles.note}>
            위의 MCP 켜기를 누르세요. Tailscale에서 연결 허용 버튼이 나오면
            HTTPS·Funnel을 허용한 뒤, 당근에서 MCP 켜기를 다시 누르세요.
            Funnel은 이 PC의 연결 주소를 인터넷에 공개합니다.
          </p>
        </li>
        <li>
          <strong>AI 앱 연결</strong>
          <p className={styles.note}>
            연결 가능 표시 → 연결 진단 → 주소 복사. /mcp를 포함한 주소로 아래
            Codex·ChatGPT 안내를 따라 등록하고, 당근에서 같은 코드를 확인해
            승인하세요.
          </p>
        </li>
      </ol>
      <p className={styles.note}>사용하는 동안 당근과 Tailscale을 켜 두세요.</p>
      <p className={styles.note}>
        로그인 오류: Tailscale에서 로그인·Connect를 확인하세요.
        MagicDNS·HTTPS·Funnel 권한 오류: Tailscale 네트워크 관리자에게
        요청하세요.
      </p>
      <p className={styles.note}>
        443 사용 중: 개발 버전 등 다른 당근의 MCP를 먼저 끄세요. 다른 앱이 사용
        중이면 해당 공유가 끝난 뒤 다시 시도하세요.
      </p>
    </div>
  );
}

export function McpConnectionGuide({
  url,
  busy,
  run,
}: {
  url?: string | null;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [client, setClient] = React.useState<"codex" | "chatgpt">("codex");
  const id = React.useId();
  return (
    <div className={styles.body}>
      <Tabs
        ariaLabel="연결할 AI 앱"
        className={styles.clientTabs}
        tabClassName={styles.clientTab}
        value={client}
        onChange={setClient}
        items={(["codex", "chatgpt"] as const).map((value) => ({
          value,
          label: value === "codex" ? "Codex" : "ChatGPT",
          id: `${id}-${value}`,
          panelId: `${id}-${value}-panel`,
        }))}
      />
      <div
        role="tabpanel"
        id={`${id}-${client}-panel`}
        aria-labelledby={`${id}-${client}`}
        className={styles.body}
      >
        {client === "chatgpt" ? (
          <ChatgptGuide />
        ) : (
          <ol className={styles.setupSteps}>
            <li>
              <strong>Codex에 서버 등록</strong>
              <CodexRegistration url={url} busy={busy} run={run} />
            </li>
            <li>
              <strong>같은 코드 확인 후 승인</strong>
              <p className={styles.note}>
                열린 브라우저와 위 승인 요청의 숫자 코드를 비교하고, 요청 권한을
                확인하세요.
              </p>
            </li>
            <li>
              <strong>새 대화에서 작업 요청</strong>
              <p className={styles.note}>
                연결 후 Codex에서 새 작업을 여세요. 당근 앱은 켜 두세요.
              </p>
              <blockquote className={styles.example}>
                “이전 화 편집한 걸 보고, 다음 화도 비슷하게 처리해줘.”
              </blockquote>
            </li>
          </ol>
        )}
        <div className={styles.actions}>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void run(() => mcpGateway.openMcpHelp(client))}
          >
            {client === "codex" ? "Codex 연결 문서" : "ChatGPT 열기"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatgptGuide() {
  return (
    <ol className={`${styles.setupSteps} ${styles.visualSteps}`}>
      <li data-guide-step="plugins">
        <strong>왼쪽 패널에서 플러그인 열기</strong>
        <p>아래 그림에 선택된 플러그인 아이콘을 누르세요.</p>
        <GuideImage
          src={sidebarImage}
          title="왼쪽 패널의 플러그인 아이콘"
          kind="sidebar"
        />
      </li>
      <li data-guide-step="add">
        <strong>추가 → MCP 앱 만들기</strong>
        <p>플러그인 화면 오른쪽 위의 추가 버튼을 누르세요.</p>
        <GuideImage src={addImage} title="추가 메뉴의 MCP 앱 만들기" />
      </li>
      <li data-guide-step="create">
        <strong>이름·연결 주소·인증 입력</strong>
        <dl className={styles.guideFields}>
          <dt>이름</dt>
          <dd>당근망가번역기</dd>
          <dt>연결</dt>
          <dd>이 설정 화면 위에서 연결 주소를 복사해 붙여 넣으세요.</dd>
          <dt>인증</dt>
          <dd>OAuth · 고급 OAuth 설정은 그대로 두세요.</dd>
        </dl>
        <p>
          “이해했으며 계속 진행하겠습니다”를 체크한 뒤 <strong>만들기</strong>를
          누르세요.
        </p>
        <GuideImage
          src={createImage}
          title="MCP 앱 만들기 · 연결 주소는 가린 예시"
          kind="form"
        />
        <p className={styles.note}>
          인증 화면이 열리면 브라우저와 당근 앱의 숫자 코드가 같은지 확인하고,
          당근 앱에서 연결을 승인하세요.
        </p>
      </li>
      <ChatgptPermissionsStep />
      <li data-guide-step="request">
        <strong>새 대화에서 작업 요청</strong>
        <p>
          새 대화에 당근망가번역기를 추가하고 요청하세요. 당근 앱은 켜 두세요.
        </p>
        <blockquote className={styles.example}>
          “이전 화 편집한 걸 보고, 다음 화도 비슷하게 처리해줘.”
        </blockquote>
      </li>
    </ol>
  );
}

function ChatgptPermissionsStep() {
  return (
    <li data-guide-step="permissions">
      <strong>
        확인 질문을 줄이려면 <span className={styles.note}>선택 사항</span>
      </strong>
      <p>
        설치된 플러그인에서 <strong>당근망가번역기</strong>를 여세요.
      </p>
      <GuideImage
        src={installedImage}
        title="설치된 플러그인의 당근망가번역기"
        kind="highlight"
      />
      <p data-guide-step="manage">
        오른쪽 위 <strong>⋯ → 관리</strong>를 누르세요.
      </p>
      <GuideImage
        src={manageImage}
        title="플러그인 더보기 메뉴의 관리"
        kind="menu"
      />
      <p>
        관리 화면에서 <strong>권한</strong> 항목을 누르세요.
      </p>
      <GuideImage src={permissionSettingsImage} title="관리 화면의 권한 항목" />
      <p>
        <strong>모든 도구 허용</strong>을 선택하면 매번 확인하지 않고 작업을
        이어갈 수 있습니다.
      </p>
      <GuideImage src={permissionsImage} title="권한 메뉴의 모든 도구 허용" />
      <p className={styles.note}>
        편리하지만 편집·삭제 같은 변경도 확인 없이 실행될 수 있습니다. 작업마다
        확인하고 싶다면 기본 또는 항상 묻기를 유지하세요. 당근 앱에서 허용한
        권한 범위는 그대로 적용됩니다.
      </p>
    </li>
  );
}

function GuideImage({
  src,
  title,
  kind,
}: {
  src: string;
  title: string;
  kind?: "sidebar" | "form" | "highlight" | "menu";
}) {
  const [expanded, setExpanded] = React.useState(false);
  const picture = (
    <div className={styles.guidePicture} data-kind={kind}>
      <img src={src} alt={title} />
      {kind === "highlight" && (
        <span className={styles.pluginHighlight} aria-hidden="true" />
      )}
    </div>
  );
  return (
    <figure className={styles.guideFigure}>
      {picture}
      <figcaption>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`${title} 크게 보기`}
          onClick={() => setExpanded(true)}
        >
          크게 보기
        </Button>
      </figcaption>
      {expanded && (
        <Modal
          title={title}
          size="xl"
          closeOnBackdrop
          onClose={() => setExpanded(false)}
          bodyClassName={styles.guidePreview}
        >
          {picture}
        </Modal>
      )}
    </figure>
  );
}

function CodexRegistration({
  url,
  busy,
  run,
}: {
  url?: string | null;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [copied, setCopied] = React.useState(false);
  const commands = url
    ? `codex mcp add carrot --url ${JSON.stringify(url)}\ncodex mcp login carrot`
    : null;
  return (
    <>
      <p className={styles.note}>
        Codex CLI가 설치된 PC의 터미널에서 두 줄을 차례로 실행하세요. 같은 PC의
        Codex 앱·CLI가 설정을 공유합니다.
      </p>
      {commands ? (
        <div className={styles.commandRow}>
          <pre className={styles.command}>
            <code>{commands}</code>
          </pre>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await navigator.clipboard.writeText(commands);
                setCopied(true);
              })
            }
          >
            {copied ? "복사됨" : "명령 복사"}
          </Button>
        </div>
      ) : (
        <p className={styles.note}>
          MCP를 켜면 이 앱 주소가 들어간 연결 명령이 표시됩니다.
        </p>
      )}
    </>
  );
}

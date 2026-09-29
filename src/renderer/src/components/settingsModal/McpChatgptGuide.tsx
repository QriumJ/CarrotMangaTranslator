import sidebarImage from "../../assets/images/mcp-chatgpt/plugins-sidebar.png";
import addImage from "../../assets/images/mcp-chatgpt/add-mcp-app.png";
import createImage from "../../assets/images/mcp-chatgpt/create-app-redacted.png";
import installedImage from "../../assets/images/mcp-chatgpt/installed-plugin.png";
import manageImage from "../../assets/images/mcp-chatgpt/manage-plugin.png";
import permissionSettingsImage from "../../assets/images/mcp-chatgpt/permission-settings.png";
import permissionsImage from "../../assets/images/mcp-chatgpt/tool-permissions.png";
import { GuideImage } from "./McpGuideImage";
import styles from "./McpSettingsPanel.module.css";

/** ChatGPT registers the server as an MCP app through its plugin screens. */
export function ChatgptGuide() {
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

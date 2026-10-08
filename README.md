# session-coach

Claude Code 세션이 길어지면 /clear, 새 프롬프트, 핸드오프를 권해주는 플러그인입니다.

## 언제 알려주나
- 컨텍스트 25만 토큰 이상 (50만부터 강하게)
- 연속 2번 이상 "아니, 다시" 같은 수정 요청
- 프롬프트 25개 이상 또는 세션 8시간 이상
- 커밋·배포 요청 3번 이상

알림은 입력창 위 띠, 상태 줄, `/coach` 명령으로 보입니다.

## 설치
1. 설치 폴더로 받습니다.
   ```bash
   git clone https://github.com/magic3ightball/session-coach ~/.claude/mods/session-coach
   ```
2. `~/.claude/settings.json` 의 `env` 에 아래를 추가합니다 (경로는 본인 홈으로).
   ```json
   "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/Users/<내아이디>/.claude/mods/session-coach" }
   ```
3. Claude Code를 새로 엽니다.

## 요구 사항
- 최신 Claude Code (데스크톱 앱 Code 탭에서 확인됨). 오래된 CLI(예: Homebrew 2.1.156)는 function hook을 지원하지 않습니다.
- 기준값은 `hooks/register.tsx` 맨 위 상수에서 바꿀 수 있습니다.

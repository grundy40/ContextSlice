/**
 * CJK Multi-Language (Traditional Chinese, Simplified Chinese, Japanese, Korean) 2-gram Tokenizer & Bilingual Mapping
 * Zero external dependencies, specifically optimized for software engineering and technical vocabulary matching.
 */

export function tokenizeCJK2gram(text: string): string[] {
  const pairMap = getCJKPairMap();
  const results: string[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = i + 1 < text.length ? text[i + 1] : null;

    if (nextChar) {
      const bigram = char + nextChar;
      if (pairMap[bigram]) {
        results.push(bigram);
        i += 2;
        continue;
      }
    }

    if (pairMap[char]) {
      results.push(char);
    }
    i += 1;
  }

  return results.length > 0 ? results : [text];
}

const PAIR_MAP: Record<string, string[]> = {
  // Auth / Login (Traditional, Simplified, Japanese, Korean)
  "登": ["login", "auth", "verify", "signin"],
  "入": ["login", "enter", "init"],
  "登录": ["login", "signin", "auth"],
  "登入": ["login", "signin", "auth"],
  "ログイン": ["login", "signin"],
  "로그인": ["login", "signin"],
  "认证": ["auth", "verify", "authentication"],
  "認證": ["auth", "verify", "authentication"],
  "認証": ["auth", "authentication"],
  "인증": ["auth", "authentication"],
  "验证": ["verify", "validate"],
  "驗證": ["verify", "validate"],
  "検証": ["verify", "validate"],
  "검증": ["verify", "validate"],
  "權限": ["permission", "role", "authz"],
  "权限": ["permission", "role", "authz"],
  "権限": ["permission", "role"],
  "권한": ["permission", "role"],
  "令牌": ["token", "jwt"],
  "權杖": ["token", "jwt"],
  "トークン": ["token"],
  "토큰": ["token"],

  // Parse / Code / Data
  "解析": ["parse", "analyze"],
  "解": ["decode", "parse"],
  "析": ["analyze", "parse"],
  "パース": ["parse"],
  "파싱": ["parse"],
  "数据": ["data"],
  "數據": ["data"],
  "データ": ["data"],
  "데이터": ["data"],
  "結構": ["struct", "structure"],
  "结构": ["struct", "structure"],
  "構造": ["struct", "structure"],
  "구조": ["struct", "structure"],

  // API / Interface / Service
  "接口": ["api", "interface"],
  "介面": ["api", "interface"],
  "インターフェース": ["interface", "api"],
  "인터페이스": ["interface", "api"],
  "服务": ["service"],
  "服務": ["service"],
  "サービス": ["service"],
  "서비스": ["service"],
  "路由": ["router", "route"],
  "路徑": ["path", "route"],
  "路径": ["path", "route"],
  "ルート": ["route", "router"],
  "라우트": ["route", "router"],

  // Database / Cache / Storage
  "數據庫": ["database", "db"],
  "数据库": ["database", "db"],
  "データベース": ["database", "db"],
  "데이터베이스": ["database", "db"],
  "緩存": ["cache"],
  "缓存": ["cache"],
  "キャッシュ": ["cache"],
  "캐시": ["cache"],
  "存儲": ["store", "storage"],
  "存储": ["store", "storage"],
  "ストレージ": ["storage"],
  "스토리지": ["storage"],

  // Config / Setting / Env
  "配置": ["config", "configuration"],
  "設定": ["config", "setup", "setting"],
  "設定ファイル": ["config"],
  "설정": ["config", "setting"],
  "環境": ["env", "environment"],
  "环境": ["env", "environment"],
  "환경": ["env", "environment"],

  // Error / Log / Debug / Test
  "錯誤": ["error", "exception"],
  "错误": ["error", "exception"],
  "エラー": ["error"],
  "에러": ["error"],
  "異常": ["exception", "error"],
  "异常": ["exception", "error"],
  "日誌": ["log", "logger"],
  "日志": ["log", "logger"],
  "ログ": ["log"],
  "로그": ["log"],
  "調試": ["debug"],
  "调试": ["debug"],
  "デバッグ": ["debug"],
  "디버그": ["debug"],
  "測試": ["test", "spec"],
  "测试": ["test", "spec"],
  "テスト": ["test"],
  "테스트": ["test"],
};

export function getCJKPairMap(): Record<string, string[]> {
  return PAIR_MAP;
}

export function bilingualLookup(term: string): string[] {
  const pairMap = getCJKPairMap();
  const lowerTerm = term.toLowerCase();
  if (pairMap[lowerTerm]) {
    return [lowerTerm, ...pairMap[lowerTerm]];
  }

  const EN_TO_MULTILINGUAL: Record<string, string[]> = {
    "login": ["登入", "登录", "ログイン", "로그인"],
    "auth": ["認證", "权限", "認証", "인증"],
    "verify": ["驗證", "验证", "検証", "검증"],
    "parse": ["解析", "パース", "파싱"],
    "data": ["數據", "数据", "データ", "데이터"],
    "struct": ["結構", "结构", "構造", "구조"],
    "api": ["接口", "介面"],
    "service": ["服務", "服务", "サービス", "서비스"],
    "router": ["路由", "ルート", "라우트"],
    "database": ["數據庫", "数据库", "データベース", "데이터베이스"],
    "cache": ["緩存", "缓存", "キャッシュ", "캐시"],
    "config": ["配置", "設定", "설정"],
    "error": ["錯誤", "错误", "エラー", "에러"],
    "log": ["日誌", "日志", "ログ", "로그"],
    "debug": ["調試", "调试", "デバッグ", "디버그"],
    "test": ["測試", "测试", "テスト", "테스트"],
  };

  for (const [en, words] of Object.entries(EN_TO_MULTILINGUAL)) {
    if (en === lowerTerm || words.includes(term)) {
      return [term, en, ...words];
    }
  }

  return [term];
}
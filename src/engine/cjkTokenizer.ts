/**
 * CJK 2-gram 分詞器 + 中英對照表
 * 零依賴輕量級實作，僅用於軟體開發關鍵詞匹配
 */

// CJK 2-gram 分詞：採用滑動視窗，優先保留常見詞彙
export function tokenizeCJK2gram(text: string): string[] {
  const pairMap = getCJKPairMap();
  const results: string[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = i + 1 < text.length ? text[i + 1] : null;

    // 尝试 2-gram 匹配
    if (nextChar) {
      const bigram = char + nextChar;
      if (pairMap[bigram]) {
        results.push(bigram);
        i += 2;
        continue;
      }
    }

    // 回退到單字，檢查是否在對照表
    if (pairMap[char]) {
      results.push(char);
    }
    i += 1;
  }

  // 若無匹配結果，返回原始文本作為備用
  return results.length > 0 ? results : [text];
}

// 50 組常見軟體開發中英對照表
const PAIR_MAP: Record<string, string[]> = {
  // 登入/驗證相關
  "登": ["login", "auth", "verify", "登録"],
  "入": ["login", "enter", "init"],
  "核": ["auth", "verify", "auth"],
  "驗": ["auth", "verify"],
  "證": ["auth"],

  // 解析/轉換相關
  "解析": ["parse"],
  "解": ["decode", "solve", "parse"],
  "析": ["parse", "analyze"],
  "轉": ["convert", "transform"],
  "換": ["convert"],

  // 數據/結構相關
  "數": ["data"],
  "據": ["data"],
  "結": ["struct", "link"],
  "構": ["struct", "construct"],
  "數據": ["data"],

  // API/接口相關
  "接": ["api", "interface", "connect"],
  "口": ["api", "port"],
  "示": ["api", "show", "display"],
  "例": ["example", "app"],

  // 數組/列表相關
  "数": ["array", "list"],
  "组": ["group", "array"],
  "列": ["list", "column"],
  "表": ["table", "list"],

  // 過程/功能相關
  "处": ["handle", "process"],
  "理": ["handle", "manage"],
  "运": ["run", "operate"],
  "行": ["run", "execute"],
  "擷": ["capture", "select"],
  "取": ["get", "select", "fetch"],

  // 文件/文本相關
  "文": ["file", "document", "text"],
  "件": ["file", "item", "component"],
  "本": ["content", "text"],
  "字": ["text", "char", "word"],
  "符": ["char", "symbol"],

  // 設置/配置相關
  "设": ["set", "setup"],
  "置": ["set", "setup"],
  "配": ["config", "prepare"],
  "元": ["param", "element"],

  // 緩存/存儲相關
  "緩": ["cache"],
  "存": ["save", "store"],
  "儲": ["store", "reserve"],

  // 連接/網絡相關
  "连": ["connect"],
  "网": ["network", "web"],
  "络": ["network"],

  // 更新/同步相關
  "更": ["update", "change"],
  "新": ["update"],
  "同": ["sync", "same"],
  "步": ["step", "process"],

  // 錯誤/日誌相關
  "错": ["error", "wrong"],
  "误": ["error"],
  "日志": ["log"],
  "日": ["date", "log"],
  "志": ["log"],

  // 用戶/編輯相關
  "用": ["user", "use"],
  "户": ["user"],
  "编": ["edit", "write"],
  "辑": ["edit"],

  // 測試/調試相關
  "测": ["test", "measure"],
  "试": ["test"],
  "调": ["debug", "adjust"],
  "試": ["test"],

  // 模塊/組件相關
  "模": ["module", "model"],
  "塊": ["module", "block"],
  "組": ["group", "component"],

  // 異常/錯誤
  "異": ["error", "abnormal"],
  "常": ["common", "error"],
  "失": ["fail", "lost"],
  "敗": ["fail"],

  // 服務/功能
  "服": ["service", "serve"],
  "務": ["service", "business"],
  "功": ["function", "feature"],
  "能": ["ability", "function"],

  // 路徑/路徑相關
  "路": ["path", "road"],
  "径": ["path", "route"],

  // 版本/更新
  "唯": ["version", "unique"],
  "號": ["number", "code"],

  // 密碼/安全
  "密": ["password", "secret"],
  "碼": ["code", "password"],
  "安": ["secure", "security"],
  "全": ["safe", "security"],
};

export function getCJKPairMap(): Record<string, string[]> {
  return PAIR_MAP;
}

// 雙語查詢：中英互轉
export function bilingualLookup(term: string): string[] {
  const pairMap = getCJKPairMap();

  // 轉小寫比對（英文）
  const lowerTerm = term.toLowerCase();
  if (pairMap[lowerTerm]) {
    return [lowerTerm, ...pairMap[lowerTerm]];
  }

  // 標點轉換：login -> 登入, parse -> 解析
  const EN_TO_ZH: Record<string, string> = {
    "login": "登入",
    "auth": "驗證",
    "verify": "驗證",
    "parse": "解析",
    "decode": "解碼",
    "convert": "轉換",
    "handle": "處理",
    "process": "過程",
    "run": "運行",
    "execute": "執行",
    "get": "取得",
    "fetch": "獲取",
    "store": "存儲",
    "save": "保存",
    "set": "設置",
    "setup": "設定",
    "connect": "連接",
    "network": "網絡",
    "update": "更新",
    "sync": "同步",
    "error": "錯誤",
    "fail": "失敗",
    "user": "用戶",
    "edit": "編輯",
    "test": "測試",
    "debug": "調試",
    "module": "模塊",
    "function": "功能",
    "service": "服務",
    "path": "路徑",
    "cache": "緩存",
    "data": "數據",
    "file": "文件",
    "text": "文本",
    "code": "代碼",
    "log": "日誌",
    "security": "安全",
  };

  // 反查：找中文對應英文
  const zhMatch = Object.entries(EN_TO_ZH).find(([, zh]) => zh === term);
  if (zhMatch) {
    return [term, zhMatch[0]];
  }

  return [term];
}
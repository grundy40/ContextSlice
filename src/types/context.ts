export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'c'
  | 'cpp'
  | 'swift'
  | 'php'
  | 'html'
  | 'css'
  | 'rust'
  | 'java'
  | 'csharp'
  | 'ruby'
  | 'sql'
  | 'other';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'const'
  | 'module';

export type NodeTier = 'full' | 'skeleton' | 'map' | 'excluded';
export type OverrideMode = 'auto' | 'full' | 'skeleton' | 'exclude';
export type WorkspaceView = 'graph' | 'dashboard' | 'diff';
export type OutputTarget = 'browser' | 'cli' | 'zero-mcp' | 'thin-mcp';

export interface CodeFile {
  id: string;
  path: string;
  language: SupportedLanguage;
  content: string;
  lineCount: number;
  rawTokens: number;
  isOversized: boolean;
}

export interface FileImport {
  rawSpecifier: string;
  resolvedFileId: string | null;
  importedNames: string[];
}

export interface AstSymbolNode {
  id: string;
  fileId: string;
  filePath: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  exported: boolean;
  startLine: number;
  endLine: number;
  lineCount: number;
  fullCode: string;
  skeletonCode: string;
  rawTokens: number;
  skeletonTokens: number;
  mapTokens: number;
  docComment: string;
  referencedIdentifiers: string[];
}

export interface DependencyEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceFileId: string;
  targetFileId: string;
  kind: 'import' | 'calls' | 'intra-file';
  weight: number;
}

export interface ParsedWorkspace {
  files: CodeFile[];
  nodes: AstSymbolNode[];
  edges: DependencyEdge[];
  fileImports: Record<string, FileImport[]>;
  totalRawTokens: number;
  totalLines: number;
}

export interface ComplexityCluster {
  clusterId: string;
  hubNodeId: string;
  hubName: string;
  filePath: string;
  memberNodeIds: string[];
  degree: number;
  foldedLines: number;
  complexityScore: number;
  currentTier: NodeTier;
  gapReason: string;
  tokenCostDelta: number;
  resolvedByMcp: boolean;
}

export interface McpToolInvocationRecord {
  id: string;
  timestamp: string;
  toolName: 'expand_skeleton_cluster';
  triggerMode: 'proactive-discovery' | 'auto-cluster-detector' | 'manual-rescan';
  requestPayload: {
    jsonrpc: '2.0';
    method: 'tools/call';
    params: {
      name: 'expand_skeleton_cluster';
      arguments: {
        nodeIds: string[];
        clusterReason: string;
        remainingBudgetTokens: number;
      };
    };
  };
  expandedNodeIds: string[];
  expandedNodeNames: string[];
  tokensAdded: number;
  gapsResolvedCount: number;
  status: 'resolved' | 'budget-capped' | 'no-gaps' | 'disabled';
}

export interface ComputedNodePlan {
  node: AstSymbolNode;
  tier: NodeTier;
  override: OverrideMode;
  hopDistance: number | null; // 0 = focal, 1 = 1-hop, 2 = 2-hop, null = unreachable
  relevanceScore: number;
  isFocal: boolean;
  injectedTokens: number;
  reason: string;
  autoExpanded?: boolean;
  complexityScore?: number;
}

export interface ProtocolComparisonMetrics {
  rawRepoTokens: number;
  slicedCodeTokens: number;
  codeReductionPercent: number;
  // Protocol & Skill Context Tax per turn
  traditionalSkillAndMcpTax: number;
  traditionalMultiTurnReadBloat: number;
  traditionalTotalTokens: number;
  thinMcpSchemaTax: number;
  thinMcpTotalTokens: number;
  zeroTaxSchemaOverhead: number;
  zeroMcpRuleTax: number;
  zeroTaxTotalTokens: number;
  netSavingsVsTraditionalPercent: number;
}

export interface ContextAssemblyResult {
  nodePlans: ComputedNodePlan[];
  focalNodeIds: string[];
  totalInjectedTokens: number;
  budgetTokens: number;
  budgetUtilizationPercent: number;
  overBudget: boolean;
  countsByTier: Record<NodeTier, number>;
  metrics: ProtocolComparisonMetrics;
  assembledPacket: string;
  detectedClusters: ComplexityCluster[];
  autoExpandedNodeIds: string[];
  autoExpansionToolCall: McpToolInvocationRecord | null;
  remainingBudgetForExpansion: number;
}

export interface SessionTokenSnapshot {
  id: string;
  stepLabel: string;
  timestamp: string;
  injectedTokens: number;
  budgetTokens: number;
  utilizationPercent: number;
  rawRepoTokens: number;
  querySummary: string;
  autoExpandedCount: number;
}

export type PromptTemplateKind = 'none' | 'fix' | 'explain' | 'review';

export interface ImportReport {
  sourceLabel: string;
  totalScanned: number;
  loadedCount: number;
  skippedUnsupported: number;
  skippedOversized: number;
  truncatedByLimit: number;
  canRescanInPlace: boolean;
}

export interface BenchmarkRow {
  id: string;
  label: string;
  query: string;
  rawTokens: number;
  traditionalTokens: number;
  slicedTokens: number;
  reductionPercent: number;
  elapsedMs: number;
  autoExpandedCount: number;
  withinBudget: boolean;
}

export type ProjectTagColor = 'sky' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate';

export interface ProjectTagConfig {
  label: string;
  color: ProjectTagColor;
}


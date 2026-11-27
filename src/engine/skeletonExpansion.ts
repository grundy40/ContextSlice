import { getMessages, Locale } from '../i18n';
import {
  ComplexityCluster,
  ComputedNodePlan,
  McpToolInvocationRecord,
  ParsedWorkspace,
} from '../types/context';

/**
 * Analyzes AST & dependency graph topology to identify folded (skeleton/map) nodes
 * whose omission creates context gaps in high-complexity dependency clusters.
 */
export function detectHighComplexityClusters(
  workspace: ParsedWorkspace,
  plans: ComputedNodePlan[],
  focalIds: string[],
  locale: Locale = 'zh-TW',
): {
  clusters: ComplexityCluster[];
  complexityByNodeId: Map<string, number>;
} {
  const { engine: eng } = getMessages(locale);
  const { edges } = workspace;
  const focalSet = new Set(focalIds);

  const neighborsByNode = new Map<string, Set<string>>();
  const crossFileCountByNode = new Map<string, number>();

  for (const plan of plans) {
    neighborsByNode.set(plan.node.id, new Set());
    crossFileCountByNode.set(plan.node.id, 0);
  }

  for (const edge of edges) {
    neighborsByNode.get(edge.sourceNodeId)?.add(edge.targetNodeId);
    neighborsByNode.get(edge.targetNodeId)?.add(edge.sourceNodeId);
    if (edge.sourceFileId !== edge.targetFileId) {
      crossFileCountByNode.set(
        edge.sourceNodeId,
        (crossFileCountByNode.get(edge.sourceNodeId) ?? 0) + 1,
      );
      crossFileCountByNode.set(
        edge.targetNodeId,
        (crossFileCountByNode.get(edge.targetNodeId) ?? 0) + 1,
      );
    }
  }

  const complexityByNodeId = new Map<string, number>();
  const clusters: ComplexityCluster[] = [];

  for (const plan of plans) {
    const { node, tier, override, hopDistance, relevanceScore } = plan;
    const neighbors = neighborsByNode.get(node.id) ?? new Set<string>();
    const degree = neighbors.size;
    const crossFileEdges = crossFileCountByNode.get(node.id) ?? 0;
    const foldedLines = Math.max(0, node.lineCount - 2);
    const tokenDelta = Math.max(0, node.rawTokens - plan.injectedTokens);

    const hopBonus = hopDistance === 1 ? 18 : hopDistance === 2 ? 9 : 0;
    const complexityScore = Math.round(
      degree * 13 +
        crossFileEdges * 14 +
        Math.min(34, node.lineCount * 0.72) +
        Math.min(20, node.referencedIdentifiers.length * 1.6) +
        Math.min(18, relevanceScore * 0.45) +
        hopBonus,
    );
    complexityByNodeId.set(node.id, complexityScore);

    // Only flag folded implementations where leaving them collapsed leaves a real context gap
    const isPassiveSignatureOnly =
      (node.kind === 'interface' || node.kind === 'type') &&
      node.rawTokens <= node.skeletonTokens + 20;

    if (
      focalSet.has(node.id) ||
      override !== 'auto' ||
      tier === 'full' ||
      isPassiveSignatureOnly ||
      tokenDelta < 30
    ) {
      continue;
    }

    const isConnectedToWorkspace =
      (hopDistance !== null && hopDistance <= 2) ||
      degree >= 2 ||
      relevanceScore >= 12;

    const qualifiesAsHighComplexity =
      complexityScore >= 46 &&
      isConnectedToWorkspace &&
      (degree >= 2 || node.lineCount >= 18 || node.referencedIdentifiers.length >= 6);

    if (!qualifiesAsHighComplexity) continue;

    const reasons: string[] = [];
    if (degree >= 2) reasons.push(eng.clusterDegree(degree));
    if (crossFileEdges >= 1) reasons.push(eng.clusterCrossFile(crossFileEdges));
    if (foldedLines >= 14) reasons.push(eng.clusterFoldedLines(foldedLines));
    if (hopDistance === 1) reasons.push(eng.clusterDirectFocal);

    clusters.push({
      clusterId: `cluster_${node.id}`,
      hubNodeId: node.id,
      hubName: node.name,
      filePath: node.filePath,
      memberNodeIds: Array.from(neighbors),
      degree,
      foldedLines,
      complexityScore,
      currentTier: tier,
      gapReason: reasons.join(' · ') || eng.clusterFallback,
      tokenCostDelta: tokenDelta,
      resolvedByMcp: false,
    });
  }

  clusters.sort((a, b) => b.complexityScore - a.complexityScore);
  return { clusters, complexityByNodeId };
}

/**
 * Executes the local `expand_skeleton_cluster` MCP JSON-RPC tool call to automatically
 * resolve detected high-complexity context gaps within the remaining token budget.
 */
export function invokeSkeletonExpansionMcpTool(params: {
  clusters: ComplexityCluster[];
  remainingBudget: number;
  autoExpandEnabled: boolean;
  triggerMode?: 'proactive-discovery' | 'auto-cluster-detector' | 'manual-rescan';
  locale?: Locale;
}): {
  expandedNodeIds: string[];
  updatedClusters: ComplexityCluster[];
  tokensAdded: number;
  toolCallRecord: McpToolInvocationRecord | null;
} {
  const {
    clusters,
    remainingBudget,
    autoExpandEnabled,
    triggerMode = 'proactive-discovery',
    locale = 'zh-TW',
  } = params;
  const { engine: eng } = getMessages(locale);

  if (clusters.length === 0) {
    return {
      expandedNodeIds: [],
      updatedClusters: clusters,
      tokensAdded: 0,
      toolCallRecord: null,
    };
  }

  const candidateIds = clusters.map((c) => c.hubNodeId);
  const topReason = clusters[0].gapReason;

  const requestPayload: McpToolInvocationRecord['requestPayload'] = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'expand_skeleton_cluster',
      arguments: {
        nodeIds: candidateIds,
        clusterReason: topReason,
        remainingBudgetTokens: remainingBudget,
      },
    },
  };

  if (!autoExpandEnabled) {
    return {
      expandedNodeIds: [],
      updatedClusters: clusters,
      tokensAdded: 0,
      toolCallRecord: {
        id: `mcp_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(eng.timeLocale, { hour12: false }),
        toolName: 'expand_skeleton_cluster',
        triggerMode,
        requestPayload,
        expandedNodeIds: [],
        expandedNodeNames: [],
        tokensAdded: 0,
        gapsResolvedCount: 0,
        status: 'disabled',
      },
    };
  }

  let budgetLeft = Math.max(0, remainingBudget);
  const expandedSet = new Set<string>();
  const expandedNames: string[] = [];
  let tokensAdded = 0;

  // Greedily expand top complexity clusters while respecting remaining budget (cap at 5 hubs per auto-pass)
  for (const cluster of clusters) {
    if (expandedSet.size >= 5) break;
    if (cluster.tokenCostDelta <= budgetLeft) {
      budgetLeft -= cluster.tokenCostDelta;
      tokensAdded += cluster.tokenCostDelta;
      expandedSet.add(cluster.hubNodeId);
      expandedNames.push(cluster.hubName);
    }
  }

  const updatedClusters = clusters.map((c) => ({
    ...c,
    resolvedByMcp: expandedSet.has(c.hubNodeId),
    currentTier: expandedSet.has(c.hubNodeId) ? ('full' as const) : c.currentTier,
  }));

  const status: McpToolInvocationRecord['status'] =
    expandedSet.size > 0 ? 'resolved' : 'budget-capped';

  return {
    expandedNodeIds: Array.from(expandedSet),
    updatedClusters,
    tokensAdded,
    toolCallRecord: {
      id: `mcp_call_${clusters.length}_${expandedSet.size}`,
      timestamp: new Date().toLocaleTimeString(eng.timeLocale, { hour12: false }),
      toolName: 'expand_skeleton_cluster',
      triggerMode,
      requestPayload,
      expandedNodeIds: Array.from(expandedSet),
      expandedNodeNames: expandedNames,
      tokensAdded,
      gapsResolvedCount: expandedSet.size,
      status,
    },
  };
}

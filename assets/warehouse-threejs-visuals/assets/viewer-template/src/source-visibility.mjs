export function hideConfiguredFloorNodes(model, requestedNames, source = null) {
  const requested = [...new Set(requestedNames)];
  const matches = new Map(requested.map(name => [name, []]));
  model.traverse(object => {
    const index = source?.associations.get(object)?.nodes;
    if (source && !Number.isInteger(index)) return;
    // GLTFLoader sanitizes runtime names; the source node index is authoritative.
    const sourceName = source?.nodes[index]?.name;
    const name = sourceName ?? object.userData.name ?? object.name;
    if (matches.has(name)) matches.get(name).push({ object, sourceName: name, nodeIndex: index ?? null });
  });
  for (const [name, nodes] of matches) {
    if (nodes.length !== 1) throw new Error(`Configured floor node "${name}" matched ${nodes.length} nodes; expected exactly one`);
  }
  // Resolve every selector before changing visibility, so errors leave the scene intact.
  const nodes = [...matches.values()].flat();
  nodes.forEach(({ object }) => { object.visible = false; });
  return {
    requested, hiddenCount: nodes.length,
    nodes: nodes.map(({ object, sourceName, nodeIndex }) => ({ sourceName, runtimeName: object.name, nodeIndex })),
  };
}

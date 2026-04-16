import type { JMeterConfig } from "./jmeter-types";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toJMeterVarSyntax(value: string): string {
  return value.replace(/\{\{(\w+)\}\}/g, "${$1}");
}

function splitUrl(urlText: string) {
  const parsed = new URL(urlText);
  return {
    protocol: parsed.protocol.replace(":", ""),
    domain: parsed.hostname,
    port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
    path: `${parsed.pathname}${parsed.search}`,
  };
}

function buildHeaderManager(
  headers: Record<string, string> | undefined,
  indent: string,
): string {
  if (!headers || Object.keys(headers).length === 0) {
    return `${indent}<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true"><collectionProp name="HeaderManager.headers"/></HeaderManager>\n${indent}<hashTree/>`;
  }

  const headerElements = Object.entries(headers)
    .map(
      ([key, value]) =>
        `${indent}    <elementProp name="" elementType="Header"><stringProp name="Header.name">${xmlEscape(
          key,
        )}</stringProp><stringProp name="Header.value">${xmlEscape(
          value,
        )}</stringProp></elementProp>`,
    )
    .join("\n");

  return `${indent}<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true"><collectionProp name="HeaderManager.headers">\n${headerElements}\n${indent}  </collectionProp></HeaderManager>\n${indent}<hashTree/>`;
}

function buildRegexExtractors(
  extractors:
    | Array<{
        varName: string;
        regex: string;
      }>
    | undefined,
  indent: string,
): string {
  if (!extractors || extractors.length === 0) return "";

  return extractors
    .map(
      (extractor) =>
        `${indent}<RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="Regex ${xmlEscape(
          extractor.varName,
        )}" enabled="true"><stringProp name="RegexExtractor.useHeaders">false</stringProp><stringProp name="RegexExtractor.refname">${xmlEscape(
          extractor.varName,
        )}</stringProp><stringProp name="RegexExtractor.regex">${xmlEscape(
          extractor.regex,
        )}</stringProp><stringProp name="RegexExtractor.template">$1$</stringProp><stringProp name="RegexExtractor.default">__MISSING__</stringProp><stringProp name="RegexExtractor.match_number">1</stringProp></RegexExtractor>\n${indent}<hashTree/>`,
    )
    .join("\n");
}

function buildSampler(
  operation: NonNullable<JMeterConfig["flowOperations"]>[number],
  index: number,
): string {
  const url = splitUrl(toJMeterVarSyntax(operation.url));
  const body = operation.body ? toJMeterVarSyntax(operation.body) : "";
  const bodyArguments = body
    ? `<boolProp name="HTTPSampler.postBodyRaw">true</boolProp><elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments"><elementProp name="" elementType="HTTPArgument"><boolProp name="HTTPArgument.always_encode">false</boolProp><stringProp name="Argument.value">${xmlEscape(
        body,
      )}</stringProp><stringProp name="Argument.metadata">=</stringProp></elementProp></collectionProp></elementProp>`
    : `<elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments"/></elementProp>`;

  const headerManager = buildHeaderManager(operation.headers, "              ");
  const regexExtractors = buildRegexExtractors(operation.extractors, "              ");

  return `          <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${xmlEscape(
            operation.name || `Request ${index + 1}`,
          )}" enabled="true">${bodyArguments}<stringProp name="HTTPSampler.domain">${xmlEscape(
            url.domain,
          )}</stringProp><stringProp name="HTTPSampler.port">${xmlEscape(
            url.port,
          )}</stringProp><stringProp name="HTTPSampler.protocol">${xmlEscape(
            url.protocol,
          )}</stringProp><stringProp name="HTTPSampler.path">${xmlEscape(
            url.path,
          )}</stringProp><stringProp name="HTTPSampler.method">${xmlEscape(
            operation.method.toUpperCase(),
          )}</stringProp><boolProp name="HTTPSampler.follow_redirects">true</boolProp><boolProp name="HTTPSampler.auto_redirects">false</boolProp><boolProp name="HTTPSampler.use_keepalive">true</boolProp><boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp><stringProp name="HTTPSampler.connect_timeout">30000</stringProp><stringProp name="HTTPSampler.response_timeout">30000</stringProp></HTTPSamplerProxy>
          <hashTree>
${headerManager}
${regexExtractors ? `${regexExtractors}\n` : ""}          </hashTree>`;
}

function buildFlowController(
  flowName: string,
  operations: NonNullable<JMeterConfig["flowOperations"]>,
): string {
  const samplers = operations
    .map((operation, index) => buildSampler(operation, index))
    .join("\n");

  return `        <GenericController guiclass="LogicControllerGui" testclass="GenericController" testname="${xmlEscape(
    flowName,
  )}" enabled="true"></GenericController>
        <hashTree>
${samplers}
        </hashTree>`;
}

export function generateJMeterPlan(config: JMeterConfig): string {
  const operations = config.flowOperations?.length
    ? config.flowOperations
    : [
        {
          name: "Requisição Principal",
          method: config.method || "GET",
          url: config.url,
          headers: config.headers,
          body: config.body,
        },
      ];

  const rampTime = Math.max(1, config.rampUpSeconds || config.vus);
  const firstModuleIndex = operations.findIndex(
    (operation) =>
      typeof operation.moduleGroup === "string" &&
      operation.moduleGroup.trim() !== "",
  );
  const authOps =
    firstModuleIndex >= 0 ? operations.slice(0, firstModuleIndex) : operations;
  const moduleOps =
    firstModuleIndex >= 0 ? operations.slice(firstModuleIndex) : [];
  const moduleFlows: NonNullable<JMeterConfig["flowOperations"]>[] = [];

  for (const operation of moduleOps) {
    const groupName = operation.moduleGroup || operation.name;
    const currentFlow = moduleFlows[moduleFlows.length - 1];
    const currentGroupName =
      currentFlow && currentFlow.length > 0
        ? currentFlow[0].moduleGroup || currentFlow[0].name
        : null;

    if (currentFlow && currentGroupName === groupName) {
      currentFlow.push(operation);
    } else {
      moduleFlows.push([operation]);
    }
  }

  const authSamplers = authOps
    .map((operation, index) => buildSampler(operation, index))
    .join("\n");
  const randomFlows = moduleFlows
    .map((flow) =>
      buildFlowController(
        `${flow[0].moduleGroup || flow[0].name} Flow`,
        flow,
      ),
    )
    .join("\n");
  const fallbackSamplers = operations
    .map((operation, index) => buildSampler(operation, index))
    .join("\n");
  const threadTree =
    moduleFlows.length > 0
      ? `        <OnceOnlyController guiclass="OnceOnlyControllerGui" testclass="OnceOnlyController" testname="Authenticate Once" enabled="true"></OnceOnlyController>
        <hashTree>
${authSamplers}
        </hashTree>
        <RandomController guiclass="LogicControllerGui" testclass="RandomController" testname="Random Module Flow" enabled="true"></RandomController>
        <hashTree>
${randomFlows}
        </hashTree>`
      : fallbackSamplers;

  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="CPX-Stress Generated Plan" enabled="true">
      <stringProp name="TestPlan.comments"></stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Generated Thread Group" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">true</boolProp>
          <stringProp name="LoopController.loops">-1</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">${config.vus}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${rampTime}</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">${config.duration}</stringProp>
        <stringProp name="ThreadGroup.delay">0</stringProp>
      </ThreadGroup>
      <hashTree>
        <CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie Manager" enabled="true">
          <collectionProp name="CookieManager.cookies"/>
          <boolProp name="CookieManager.clearEachIteration">false</boolProp>
        </CookieManager>
        <hashTree/>
${threadTree}
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>
`;
}

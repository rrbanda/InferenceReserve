export const architectureDiagram = `graph TB
  Client([Client Request])
  subgraph ingress [Ingress]
    GW["Gateway — Envoy AI Gateway"]
    Auth["PT Auth Service — ext_authz"]
  end
  subgraph routing [Routing — Gateway API Inference Extension]
    HR["HTTPRoute"]
    IP_PT["InferencePool: tenant-a"]
    IP_Shared["InferencePool: shared"]
    EPP["llm-d Endpoint Picker"]
  end
  subgraph serving [Serving — KServe + vLLM]
    LLMIS["LLMInferenceService — KServe v0.17"]
    vLLM["vLLM on H100 NVL GPUs"]
  end
  subgraph isolation [Isolation]
    NS["Namespace + ResourceQuota"]
    Nodes["Tainted PT Nodes"]
  end
  subgraph mgmt [Management — Custom Build]
    CRD["ProvisionedThroughput CRD"]
    ResMgr["Reservation Manager"]
  end
  subgraph obs [Observability]
    DCGM["DCGM Exporter"]
    vLLM_M["vLLM /metrics"]
    Prom[Prometheus]
    Graf[Grafana Dashboards]
    Bill[Billing Pipeline]
  end
  Client --> GW
  GW --> Auth
  Auth --> HR
  HR --> IP_PT
  HR --> IP_Shared
  IP_PT --> EPP
  EPP --> vLLM
  LLMIS -.-> vLLM
  vLLM --> NS
  NS --> Nodes
  Operator -.-> CRD
  Operator -.-> NS
  Operator -.-> LLMIS
  Operator -.-> Nodes
  Operator -.-> IP_PT
  Operator -.-> HR
  Operator -.-> Graf
  DCGM --> Prom
  vLLM_M --> Prom
  Prom --> Graf
  vLLM_M --> Bill`;

export const consumerJourneyDiagram = `graph LR
  A[Discover] --> B[Size]
  B --> C[Request]
  C --> D[Provision]
  D --> E[Onboard]
  E --> F[Use]
  F --> G[Monitor]
  G --> H[Manage]
  style A fill:#003B70,color:#fff
  style B fill:#003B70,color:#fff
  style C fill:#003B70,color:#fff
  style D fill:#003B70,color:#fff
  style E fill:#003B70,color:#fff
  style F fill:#003B70,color:#fff
  style G fill:#003B70,color:#fff
  style H fill:#003B70,color:#fff`;

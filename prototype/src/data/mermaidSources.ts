export const architectureDiagram = `graph TB
  Client([Client Request])
  subgraph dataplane ["Data Plane — Envoy AI Gateway"]
    GW["Gateway: token counting, filter chain host"]
    subgraph filters ["Filter Chain (runs inside Gateway)"]
      Auth["① ext_authz: PT Auth Service"]
      HR["② HTTPRoute matching"]
      EPP["③ ext_proc: llm-d EPP"]
    end
  end
  vLLM["vLLM on H100 NVL (EPP-selected pod)"]
  subgraph ctrlplane ["Control Plane — KServe + Reservation Mgmt"]
    LLMIS["LLMInferenceService — KServe v0.17"]
    IP["InferencePool CRD — pod set for EPP"]
    CRD["ProvisionedThroughput CRD"]
    ResMgr["Reservation Manager"]
  end
  subgraph obs [Observability]
    DCGM["DCGM Exporter"]
    vLLM_M["vLLM /metrics"]
    Prom[Prometheus]
    Graf[Grafana Dashboards]
    CB[Chargeback Pipeline]
  end
  Client --> GW
  GW --> Auth
  Auth --> HR
  HR --> EPP
  GW -->|"forwards to selected pod"| vLLM
  EPP -.->|"reads pod set"| IP
  ResMgr -.->|"reads"| CRD
  ResMgr -.->|"applies YAML"| LLMIS
  LLMIS -.->|"auto-creates"| IP
  LLMIS -.->|"auto-creates"| HR
  ResMgr -.-> Graf
  DCGM --> Prom
  vLLM_M --> Prom
  Prom --> Graf
  vLLM_M --> CB`;

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

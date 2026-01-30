export type SignatureProvider = "none" | "usb_agent" | "digigo" | "dss" | "hsm";

export type SignatureStatus = "unconfigured" | "pairing" | "paired" | "error";

export type SignatureConfig = Record<string, any>;

export type SignatureSettings = {
  provider: SignatureProvider;
  status: SignatureStatus;
  config: SignatureConfig;
};

export type SignRequest = {
  companyId: string;
  environment: "test" | "production";
  xml: string;
};

export type SignResult = {
  signedXml: string;
  meta?: Record<string, any>;
};

export type VpcItem = {
  id: string;
  name?: string;
  cidr?: string;
  status?: string;
};

export type SubnetItem = {
  id: string;
  name?: string;
  cidr?: string;
  availability_zone?: string;
  available_ip_address_count?: number;
};

export type SecurityGroupItem = {
  id: string;
  name?: string;
};
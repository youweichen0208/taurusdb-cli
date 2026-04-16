export const errorMap: Record<string, { friendly: string; hint?: string }> = {
  "APIGW.0301": {
    friendly: "AK/SK 认证失败",
    hint: "请运行 taurusdb configure 重新配置认证信息",
  },
  "APIGW.0302": {
    friendly: "权限不足，无法执行此操作",
    hint: "请检查 IAM 权限",
  },
  "DBS.200001": {
    friendly: "资源不存在",
    hint: "请运行 taurusdb instance list 查看实例",
  },
  "DBS.200025": {
    friendly: "可用区(AZ)参数不合法",
    hint: "请指定有效 master-az",
  },
  "DBS.200019": {
    friendly: "规格不存在",
    hint: "请运行 taurusdb flavor list 查看规格",
  },
  "DBS.200040": { friendly: "配额已超限", hint: "请联系华为云提升配额" },
  "DBS.200108": {
    friendly: "密码不符合规范",
    hint: "密码需包含至少三类字符且长度 8-32",
  },
  "DBS.200056": { friendly: "账户余额不足", hint: "请前往控制台充值" },
  "DBS.200023": {
    friendly: "VPC 或子网不存在",
    hint: "请检查 --vpc-id 和 --subnet-id",
  },
  "DBS.280475": {
    friendly: "按需实例不支持指定存储大小",
    hint: "请去掉 --volume-size",
  },
};
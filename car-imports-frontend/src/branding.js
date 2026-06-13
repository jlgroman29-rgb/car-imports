export const COMPANY_BRAND = {
  name: "Minier Castillo Auto Import S.R.L",
  company_name: "Minier Castillo Auto Import S.R.L",
  subtitle: "Gestión de inventario, ventas y finanzas",
  address: "Calle Francisco Segura y Sandoval No. 110, Los Mina",
  phone: "809-596-1345",
  rnc: "130-41028-3",
  city: "Santo Domingo",
  email: "",
  website: "",
  logo: "/logo-minier.png",
  logo_url: "/logo-minier.png"
};

export const normalizeCompanySettings = (settings = {}) => {
  const name = settings.company_name || settings.name || COMPANY_BRAND.name;
  const logo = settings.logo_url || settings.logo || COMPANY_BRAND.logo;

  return {
    ...COMPANY_BRAND,
    id: settings.id || 1,
    name,
    company_name: name,
    rnc: settings.rnc ?? COMPANY_BRAND.rnc,
    address: settings.address ?? COMPANY_BRAND.address,
    city: settings.city ?? COMPANY_BRAND.city,
    phone: settings.phone ?? COMPANY_BRAND.phone,
    email: settings.email ?? COMPANY_BRAND.email,
    website: settings.website ?? COMPANY_BRAND.website,
    logo,
    logo_url: logo,
    updated_at: settings.updated_at || null
  };
};

export const getCompanyLogoUrl = (companySettings = COMPANY_BRAND) => {
  const company = normalizeCompanySettings(companySettings);

  if (typeof window === "undefined" || !window.location?.origin) {
    return company.logo;
  }

  if (/^https?:\/\//i.test(company.logo) || company.logo.startsWith("data:")) {
    return company.logo;
  }

  return `${window.location.origin}${company.logo}`;
};

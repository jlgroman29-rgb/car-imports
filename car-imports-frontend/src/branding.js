export const COMPANY_BRAND = {
  name: "Minier Castillo Auto Import S.R.L",
  subtitle: "Gestión de inventario, ventas y finanzas",
  address: "Calle Francisco Segura y Sandoval No. 110, Los Mina",
  phone: "809-596-1345",
  rnc: "130-41028-3",
  city: "Santo Domingo",
  logo: "/logo-minier.png"
};

export const getCompanyLogoUrl = () => {
  if (typeof window === "undefined" || !window.location?.origin) {
    return COMPANY_BRAND.logo;
  }

  return `${window.location.origin}${COMPANY_BRAND.logo}`;
};

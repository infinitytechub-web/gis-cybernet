// Comprehensive list of countries, African countries listed first for priority
const AFRICAN_COUNTRIES = [
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
  "Congo (Brazzaville)", "Congo (DRC)", "Côte d'Ivoire", "Djibouti", "Egypt",
  "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia",
  "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya",
  "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco",
  "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda",
  "São Tomé and Príncipe", "Senegal", "Seychelles", "Sierra Leone", "Somalia",
  "South Africa", "South Sudan", "Sudan", "Tanzania", "Togo", "Tunisia",
  "Uganda", "Zambia", "Zimbabwe",
];

const OTHER_COUNTRIES = [
  "Afghanistan", "Albania", "Andorra", "Antigua and Barbuda", "Argentina",
  "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
  "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Brazil", "Brunei", "Bulgaria",
  "Cambodia", "Canada", "Chile", "China", "Colombia", "Costa Rica", "Croatia",
  "Cuba", "Cyprus", "Czech Republic", "Denmark", "Dominica",
  "Dominican Republic", "Ecuador", "El Salvador", "Estonia", "Fiji",
  "Finland", "France", "Georgia", "Germany", "Greece", "Grenada", "Guatemala",
  "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia",
  "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos",
  "Latvia", "Lebanon", "Liechtenstein", "Lithuania", "Luxembourg",
  "Malaysia", "Maldives", "Malta", "Marshall Islands", "Mexico", "Micronesia",
  "Moldova", "Monaco", "Mongolia", "Montenegro", "Myanmar", "Nauru", "Nepal",
  "Netherlands", "New Zealand", "Nicaragua", "North Korea", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama",
  "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Saint Kitts and Nevis", "Saint Lucia",
  "Saint Vincent and the Grenadines", "Samoa", "San Marino",
  "Saudi Arabia", "Serbia", "Singapore", "Slovakia", "Slovenia",
  "Solomon Islands", "South Korea", "Spain", "Sri Lanka", "Suriname",
  "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Thailand",
  "Timor-Leste", "Tonga", "Trinidad and Tobago", "Turkey", "Turkmenistan",
  "Tuvalu", "Ukraine", "United Arab Emirates", "United Kingdom",
  "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City",
  "Venezuela", "Vietnam", "Yemen",
];

export const COUNTRIES = [...AFRICAN_COUNTRIES, ...OTHER_COUNTRIES];

// Also export a "Ghanaian" demonym-style list for passport nationality
export const NATIONALITIES = COUNTRIES;

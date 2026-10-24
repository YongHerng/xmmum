"""All 17 UN Sustainable Development Goals with search keywords.

Used by the reading list (all goals), the live news feed and the project SDG assessor.
Kept separate from catalog.SDGS so the existing career engine is unchanged.
"""

# number: (title, representative target, short description, official colour, news query, keywords)
ALL_SDGS = {
    1: ("No Poverty", "1.4", "End poverty in all its forms everywhere.", "#E5243B",
        '"poverty" sustainable development',
        ["poverty", "poor", "low-income", "income support", "welfare", "b40", "microfinance", "financial inclusion"]),
    2: ("Zero Hunger", "2.4", "End hunger, achieve food security and promote sustainable agriculture.", "#DDA63A",
        '"food security" OR "zero hunger"',
        ["hunger", "food", "agriculture", "farm", "farming", "crop", "nutrition", "food bank", "harvest"]),
    3: ("Good Health and Well-being", "3.4", "Ensure healthy lives and promote well-being for all at all ages.", "#4C9F38",
        '"public health" sustainable development',
        ["health", "medical", "hospital", "clinic", "mental health", "well-being", "wellbeing", "patient", "disease", "fitness"]),
    4: ("Quality Education", "4.4", "Ensure inclusive and equitable quality education and lifelong learning.", "#C5192D",
        '"quality education" OR "skills training" SDG',
        ["education", "learning", "teach", "tutor", "student", "school", "course", "training", "workshop", "mentor", "literacy"]),
    5: ("Gender Equality", "5.5", "Achieve gender equality and empower all women and girls.", "#FF3A21",
        '"gender equality" women empowerment',
        ["gender", "women", "girls", "female", "equality", "women in tech"]),
    6: ("Clean Water and Sanitation", "6.3", "Ensure availability and sustainable management of water and sanitation.", "#26BDE2",
        '"clean water" OR "water sanitation" sustainability',
        ["water", "sanitation", "river", "wastewater", "flood", "hygiene", "drainage", "watershed"]),
    7: ("Affordable and Clean Energy", "7.2", "Ensure access to affordable, reliable, sustainable and modern energy.", "#FCC30B",
        '"renewable energy" OR "clean energy" transition',
        ["energy", "solar", "renewable", "electricity", "power", "battery", "efficiency", "wind", "grid"]),
    8: ("Decent Work and Economic Growth", "8.5", "Promote sustained, inclusive economic growth and decent work for all.", "#A21942",
        '"decent work" OR "future of work" OR "green jobs"',
        ["job", "employment", "career", "productivity", "small business", "sme", "entrepreneur", "income", "workforce", "automation"]),
    9: ("Industry, Innovation and Infrastructure", "9.5", "Build resilient infrastructure and foster innovation.", "#FD6925",
        '"digital infrastructure" OR "innovation" sustainable industry',
        ["innovation", "infrastructure", "industry", "manufacturing", "iot", "cloud", "software", "app", "platform", "prototype", "research", "automation", "ai", "machine learning"]),
    10: ("Reduced Inequalities", "10.2", "Reduce inequality within and among countries.", "#DD1367",
         '"reduce inequality" OR "social inclusion"',
         ["inclusion", "inclusive", "accessibility", "accessible", "disability", "disabled", "refugee", "migrant", "underserved", "minority", "rural"]),
    11: ("Sustainable Cities and Communities", "11.2", "Make cities inclusive, safe, resilient and sustainable.", "#FD9D24",
         '"sustainable cities" OR "smart city" OR "public transport"',
         ["city", "urban", "transport", "housing", "community", "neighbourhood", "neighborhood", "mobility", "traffic", "smart city"]),
    12: ("Responsible Consumption and Production", "12.5", "Ensure sustainable consumption and production patterns.", "#BF8B2E",
         '"circular economy" OR recycling OR "food waste"',
         ["recycle", "recycling", "waste", "circular", "reuse", "packaging", "plastic", "upcycle", "supply chain", "consumption", "esg"]),
    13: ("Climate Action", "13.3", "Take urgent action to combat climate change and its impacts.", "#3F7E44",
         '"climate action" OR "climate change" OR decarbonisation',
         ["climate", "carbon", "emission", "greenhouse", "net zero", "co2", "decarbon", "footprint", "global warming"]),
    14: ("Life Below Water", "14.1", "Conserve and sustainably use the oceans, seas and marine resources.", "#0A97D9",
         '"ocean conservation" OR "marine pollution"',
         ["ocean", "sea", "marine", "coral", "fish", "fishing", "beach", "coastal", "mangrove"]),
    15: ("Life on Land", "15.1", "Protect, restore and promote sustainable use of terrestrial ecosystems.", "#56C02B",
         '"biodiversity" OR deforestation OR reforestation',
         ["forest", "tree", "biodiversity", "wildlife", "land", "deforestation", "habitat", "species", "gis", "conservation"]),
    16: ("Peace, Justice and Strong Institutions", "16.6", "Promote peaceful, inclusive societies and accountable institutions.", "#00689D",
         '"good governance" OR "anti-corruption" OR "cybersecurity"',
         ["justice", "governance", "transparency", "corruption", "security", "cybersecurity", "privacy", "law", "legal", "rights", "civic"]),
    17: ("Partnerships for the Goals", "17.17", "Strengthen the means of implementation and global partnership.", "#19486A",
         '"sustainable development" partnership OR collaboration',
         ["partnership", "partner", "ngo", "collaboration", "volunteer", "open source", "open data", "stakeholder", "hackathon"]),
}


def sdg_title(number):
    return ALL_SDGS[number][0]


def sdg_color(number):
    return ALL_SDGS[number][3]

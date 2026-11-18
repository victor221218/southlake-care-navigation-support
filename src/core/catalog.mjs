export const enums = {
  regions: ['Georgina', 'Newmarket', 'East Gwillimbury', 'Aurora', 'Richmond Hill', 'Vaughan', 'Markham', 'Whitchurch-Stouffville', 'King', 'Bradford', 'Innisfil', 'North York'],
  categories: ['Transportation', 'Home supports', 'Food and nutrition', 'Language access', 'Mental health', 'Caregiver support', 'Housing support', 'Financial assistance', 'Social connection'],
  age_bands: ['Unspecified', 'Under 18', '18–39', '40–64', '65+'],
  mobility: ['Unspecified', 'Ambulatory', 'Walker', 'Wheelchair', 'Lifting assistance'],
  languages: ['Unspecified', 'English', 'French', 'Arabic', 'Cantonese', 'Mandarin', 'Portuguese', 'Spanish', 'Tamil', 'Other'],
  timing: ['Flexible', 'Within 2 days', 'Within a week', 'Weekday daytime', 'Evenings or weekends'],
  delivery: ['Received', 'Not received', 'Pending', 'Declined'],
  sentiments: ['Unspecified', 'Happy', 'Unhappy', 'Mixed'],
  reasons: ['None', 'Capacity', 'Eligibility', 'Coverage', 'Access requirement', 'Unable to contact', 'Patient choice', 'Other'],
  goals: ['Balanced', 'Service delivery', 'Patient satisfaction'],
  scopes: ['Personal', 'Personal and shared'],
  attributes: ['Availability', 'Wheelchair access', 'Callback time'],
  values: {
    Availability: ['Accepting inquiries', 'At capacity', 'Waitlist', 'Unknown'],
    'Wheelchair access': ['Available', 'Unavailable', 'Unknown'],
    'Callback time': ['Within 1 day', '2–3 days', 'Over 3 days', 'Unknown']
  }
};

const york = ['Georgina', 'Newmarket', 'East Gwillimbury', 'Aurora', 'Richmond Hill', 'Vaughan', 'Markham', 'Whitchurch-Stouffville', 'King'];
const catchment = [...york, 'Bradford', 'Innisfil'];
const checked = '2026-11-13';
const service = (id, name, category, coverage, summary, source_url, extra = {}) => ({
  id, name, category, coverage, summary, source_url, source_checked: checked,
  wheelchair: 'Unknown', lead_days: null, languages: ['Confirm with provider'], availability: 'Verify with provider',
  access: 'Contact the program to confirm eligibility and current access requirements.',
  phone: '', evidence_origin: 'Public provider source', ...extra
});

// Public summaries are sourced from the linked provider pages. No historical outcomes are seeded for real services.
export const catalog = [
  service('chats-rides', 'CHATS · iRIDEplus', 'Transportation', catchment,
    'Grouped rides for eligible older adults and adults facing physical or cognitive access barriers.',
    'https://chats.on.ca/community-transportation/', {
      phone: '905-713-6596', minimum_age: 18, wheelchair_excluded_regions: york, lifting: false, lead_days: 3,
      access: 'Register with CHATS. Request a ride at least three business days ahead. York Region wheelchair transport requires another route.',
      languages: ['Interpretation available'], hours: 'Weekday daytime', source_notice: 'Fees and ride capacity are confirmed when requested.'
    }),
  service('yrt-paratransit', 'YRT · Mobility On-Request Paratransit', 'Transportation', york,
    'Shared accessible transit for people whose functional limitations prevent conventional transit use.',
    'https://www.yrt.ca/en/schedules-and-maps/registration-and-eligibility.aspx', {
      phone: '1-888-762-2950', wheelchair: 'Available', lifting: false,
      access: 'Apply to YRT for an individual eligibility review. A registration decision is required before use.',
      source_notice: 'Eligibility is determined by YRT. Trip arrangements depend on the approved level of service.'
    }),
  service('chats-home-help', 'CHATS · Home Help', 'Home supports', catchment,
    'Practical help with household tasks including light cleaning, laundry, and meal preparation.',
    'https://chats.on.ca/in-home-services/', {
      phone: '1-877-452-4287', minimum_age: 18, access: 'Speak with CHATS intake about the support requested, catchment, and current eligibility.',
      languages: ['Interpretation available'], source_notice: 'Age criteria, fees, staffing, and visit times require confirmation.'
    }),
  service('chats-personal-support', 'CHATS · Personal Support Services', 'Home supports', catchment,
    'Personal support for older adults, including assistance with daily personal care.',
    'https://chats.on.ca/in-home-services/', {
      phone: '1-877-452-4287', access: 'Ask CHATS intake to assess the required support and explain the access route.',
      languages: ['Interpretation available'], source_notice: 'Program fit and current support availability require provider confirmation.'
    }),
  service('chats-caregiver-relief', 'CHATS · In-Home Caregiver Relief', 'Caregiver support', catchment,
    'In-home personal support that gives caregivers a break.',
    'https://chats.on.ca/in-home-services/', {
      phone: '1-877-452-4287', access: 'Contact CHATS about the caregiver’s access requirements and the support currently in place.',
      languages: ['Interpretation available'], source_notice: 'Eligibility, fees, and the available respite schedule require confirmation.'
    }),
  service('chats-interpretation', 'CHATS · Interpretation access', 'Language access', catchment,
    'Interpretation for people using CHATS programs or calling CHATS for service information.',
    'https://chats.on.ca/interpretation-services/', {
      phone: '905-713-6596', languages: ['Interpretation available'],
      access: 'Ask the CHATS representative for an interpreter when discussing a CHATS program or service.',
      source_notice: 'This route supports CHATS conversations. Confirm the required language with CHATS.'
    }),
  service('cmha-intake', 'CMHA York & South Simcoe · Central Intake', 'Mental health', catchment,
    'An intake contact for community mental health and addiction programs.',
    'https://cmha-yr.on.ca/contact-us/', {
      phone: '1-866-345-0183 ext. 3321', access: 'Speak with Central Intake about available programs, referral requirements, and program fit.',
      source_notice: 'Requirements and waiting times differ between programs.'
    }),
  service('cmha-adult', 'CMHA York & South Simcoe · Adult program pathways', 'Mental health', catchment,
    'Information about community mental health programs, with several pathways listed for ages 16 and older.',
    'https://cmha-yr.on.ca/get-support/adult/', {
      phone: '1-866-345-0183', minimum_age: 16, languages: ['English', 'French'],
      access: 'Ask Central Intake to confirm the appropriate program and its access conditions.',
      source_notice: 'The provider confirms eligibility and referral requirements for the specific program.'
    }),
  service('routes-rides', 'Routes Connecting Communities · Transportation', 'Transportation', york,
    'Volunteer rides and an accessible van for residents facing transportation barriers.',
    'https://www.routescc.org/services', {
      phone: '905-722-4616 ext. 1', email: 'info@routescc.org', wheelchair: 'Available',
      access: 'Contact Routes to register and discuss the trip, required assistance, fare and suitable vehicle.',
      coverage_note: 'York Region residents; confirm the pickup area and destination when booking.',
      fees: 'Fares apply. Ask about current rates and subsidy criteria.', booking_url: 'https://www.routescc.org/services'
    }),
  service('circle-iride', 'Circle of Care · iRIDE', 'Transportation', ['North York'],
    'Community rides for older adults and adults with disabilities, including trips to appointments and programs.',
    'https://irideplus.com/index.php/about-us/', {
      phone: '1-844-474-3301', access: 'New riders need an intake assessment. Confirm trip eligibility, vehicle requirements and charges.',
      coverage_note: 'Circle of Care manages the iRIDE service south of Steeles. Use CHATS for the north-of-Steeles intake route.',
      booking_url: 'https://circleofcare.com/iride-clients/', fees: 'Distance-based fares; ask the provider for the current quote.'
    }),
  service('ttc-wheeltrans', 'TTC · Wheel-Trans', 'Transportation', ['North York'],
    'Specialized public transit for applicants whose disability prevents some or all conventional transit use.',
    'https://www.ttc.ca/wheel-trans/how-to-apply', {
      phone: '416-393-4111', wheelchair: 'Available', lifting: false,
      access: 'Apply for a TTC eligibility decision before booking. An assessment or professional information may be requested.',
      referral: 'Individual application; TTC determines eligibility and category of service.',
      referral_url: 'https://portal.ttc.ca/', coverage_note: 'Toronto service area, including North York. Ask about connections to neighbouring transit systems.',
      fees: 'Transit fares apply; check the current TTC fare policy.'
    }),
  service('nysc-transport', 'North York Seniors Centre · Transportation', 'Transportation', ['North York'],
    'Registered riders can request trips to appointments and centre programs within defined service boundaries.',
    'https://nyseniors.org/programs-services/transportation', {
      phone: '416-733-4111', wheelchair: 'Unavailable', lifting: false,
      access: 'Ask intake to confirm registration, membership and eligibility requirements. Riders must meet program criteria and enter the vehicle with minimal assistance.',
      coverage_note: 'Pickup catchment: Bathurst to Victoria Park and Steeles to Highway 401; confirm permitted destinations.',
      hours_details: 'Weekday service is listed; confirm pickup windows and booking-office hours.',
      fees: 'Distance-based fares are posted on the provider page. Confirm the current amount before booking.'
    }),
  service('betterliving-transport', 'Better Living · Transportation', 'Transportation', ['North York'],
    'Community transport for people who cannot drive or have difficulty using public transit.',
    'https://mybetterliving.ca/helping-you-in-the-community/', {
      phone: '416-447-7244 ext. 541',
      access: 'Contact intake about eligibility, pickup boundaries, assistance and current ride availability.',
      coverage_note: 'Serves a defined North York catchment. Some programs may reach beyond the general boundary; confirm the address with intake.',
      fees: 'Charges apply; request a current quote.'
    }),
  service('ohah-homecare', 'Ontario Health atHome · Home-care referral', 'Home supports', [...catchment, 'North York'],
    'Assessment and coordination for publicly funded home care, including nursing, therapy and personal support.',
    'https://www.ontariohealthathome.ca/getting-started/', {
      phone: '1-833-515-1234',
      access: 'Anyone may make a referral with the person’s consent. A care coordinator assesses eligibility and support needs.',
      referral_url: 'https://www.ontariohealthathome.ca/making-a-referral/',
      referral: 'Self, caregiver or health-professional referral. Use the local office’s process for hospital referrals.',
      coverage_note: 'Provincial access route; the provider confirms the appropriate local team.',
      fees: 'Eligible assessed services are publicly funded; ask about any costs for supplies or other supports.'
    }),
  service('betterliving-home', 'Better Living · Home Support', 'Home supports', ['North York'],
    'Practical support with household activities to help people remain at home.',
    'https://mybetterliving.ca/community-services/home-support/', {
      phone: '416-447-7244 ext. 541', access: 'Ask intake about the required tasks, program criteria, fees and scheduling.',
      coverage_note: 'Defined North York catchment; confirm the residence is within the program’s area.'
    }),
  service('chats-meals', 'CHATS · Meals on Wheels', 'Food and nutrition', catchment,
    'Frozen meals delivered on a scheduled weekly route, with several menu options.',
    'https://chats.on.ca/in-home-services/meals-on-wheels/', {
      phone: '905-713-6596 option 2', email: 'mealsonwheels@chats.on.ca', hours: 'Weekday daytime', lead_days: 7,
      access: 'Complete registration with a coordinator before ordering. Confirm eligibility, the ordering deadline and safe delivery arrangements.',
      coverage_note: 'York Region and South Simcoe. Confirm the exact delivery route, including areas not named on the posted schedule.',
      fees: 'Meal charges apply; delivery is listed as free. Ask about current prices and subsidies.',
      referral_url: 'https://chats.on.ca/in-home-services/meals-on-wheels/'
    }),
  service('routes-food', 'Routes Connecting Communities · Food Delivery', 'Food and nutrition', york,
    'Delivery from participating food pantries and community meal partners for people facing transport barriers.',
    'https://www.routescc.org/services', {
      phone: '905-722-4616 ext. 1', email: 'info@routescc.org',
      access: 'A participating food organization must refer the person. Confirm available partner and delivery coverage.',
      referral: 'Referral from the food provider is required.', fees: 'The provider describes this delivery program as free.'
    }),
  service('nyharvest-food', 'North York Harvest · Food Assistance', 'Food and nutrition', ['North York'],
    'Help finding the appropriate local food bank in the North York Harvest network.',
    'https://northyorkharvest.com/contact-us/', {
      phone: '416-635-7771 ext. 4600', email: 'referrals@northyorkharvest.com', hours: 'Weekday daytime',
      access: 'Contact the food-assistance team to identify the appropriate food bank and its intake requirements.',
      coverage_note: 'The network uses local catchments; the referral team confirms the correct location.'
    }),
  service('georgina-food', 'Georgina Food Pantry', 'Food and nutrition', ['Georgina'],
    'A local food-support contact for people living in Georgina.',
    'https://georginafoodpantry.com/contact', {
      phone: '905-596-0557', email: 'contact@georginafoodpantry.com', address: '20849 Dalton Road, Sutton West, Ontario',
      access: 'Contact the pantry to confirm registration, collection arrangements and available support.',
      source_notice: 'Office hours and food-pickup appointments can differ; confirm the requested visit.'
    }),
  service('newmarket-food', 'Newmarket Food Pantry · Food Support', 'Food and nutrition', ['Newmarket', 'East Gwillimbury'],
    'Food assistance for households in Newmarket and East Gwillimbury, with registration and appointment options.',
    'https://newmarketfoodpantry.ca/need-food/', {
      phone: '905-895-6823 ext. 120', address: '1251 Gorham Street, Units 8 and 9, Newmarket, Ontario',
      access: 'Register before the first visit. The provider asks for identification and address information for household members; confirm the current requirements directly.',
      booking_url: 'https://newmarketfoodpantry.ca/need-food/',
      source_notice: 'Discuss any collection, mobility or transportation barriers with the pantry.'
    }),
  service('accessalliance-language', 'Access Alliance · Language Services', 'Language access', [...catchment, 'North York'],
    'Professional interpretation and translation for health and community-service settings.',
    'https://accessalliance.ca/access-alliance-language-services/', {
      phone: '416-324-2731', email: 'languages@accessalliance.ca', languages: ['Interpretation available'],
      access: 'The referring organization should confirm the language, interpreting format, booking process and fee arrangements.',
      coverage_note: 'On-site and remote options differ. Confirm the location and requested format with the language-service team.',
      source_notice: 'Availability for a particular language and appointment must be confirmed.'
    }),
  service('yssn-access', 'YSSN · Streamlined Access', 'Mental health', catchment,
    'A single access pathway for several community mental-health, addiction and related support programs.',
    'https://yssn.ca/access-services/streamlined-access/', {
      minimum_age: 16, access: 'Use Streamlined Access to discuss appropriate programs, application requirements and current access.',
      coverage_note: 'York Region and South Simcoe; individual program criteria can differ.',
      referral_url: 'https://yssn.ca/access-services/streamlined-access/'
    }),
  service('oco-caregiver', 'Ontario Caregiver Organization · Caregiver Helpline', 'Caregiver support', [...catchment, 'North York'],
    'Information and referrals to resources for unpaid caregivers across Ontario.',
    'https://ontariocaregiver.ca/help/helpline/', {
      phone: '1-833-416-2273', hours: '24/7', languages: ['English', 'French', 'Interpretation available'],
      access: 'Caregivers can call directly for help finding relevant resources. This is an information service rather than counselling.',
      fees: 'The provider describes the helpline as free.', coverage_note: 'Ontario-wide telephone support.'
    }),
  service('alz-york-firstlink', 'Alzheimer Society of York Region · First Link', 'Caregiver support', york,
    'An initial contact for dementia-related education, community connections and support for care partners.',
    'https://alzheimer.ca/york/en/help-support/programs-services/first-link', {
      phone: '905-726-3477',
      access: 'Contact the First Link team to discuss available support and the appropriate referral route.',
      referral_url: 'https://alzheimer.ca/york/en/help-support/programs-services/first-link'
    }),
  service('york-housing', 'York Region · Housing Access', 'Housing support', york,
    'The application pathway for York Region’s subsidized rental-housing waiting list.',
    'https://www.york.ca/support/housing/applying-subsidized-housing', {
      phone: '1-877-464-9675', access: 'Review the application criteria with Housing Access. Applying does not establish eligibility or an immediate housing offer.',
      referral_url: 'https://www.york.ca/support/housing/applying-subsidized-housing',
      source_notice: 'This is a subsidized-housing application route; confirm current waiting-list and vacancy information.'
    }),
  service('york-ontarioworks', 'York Region · Ontario Works application', 'Financial assistance', york,
    'Application information for income and related support for eligible residents in financial need.',
    'https://www.york.ca/support/ontario-works/applying-financial-assistance', {
      access: 'Use the official application route or contact the program about current eligibility, documentation and assistance.',
      referral_url: 'https://www.york.ca/support/ontario-works/applying-financial-assistance',
      source_notice: 'A program decision is required; the directory entry does not establish entitlement.'
    }),
  service('routes-friendly', 'Routes Connecting Communities · Friendly Calls', 'Social connection', york,
    'A volunteer matching program for regular friendly conversation by telephone.',
    'https://www.routescc.org/friendlycalls', {
      phone: '905-722-4616', email: 'info@routescc.org',
      access: 'Contact Routes or use its public participant form to discuss a suitable volunteer match.',
      source_notice: 'Friendly calls provide social connection; they are not counselling or emergency response.'
    })
];

export const practiceCatalog = [
  service('practice-ride-a', 'Practice · North Corridor Rides', 'Transportation', catchment,
    'Fictional accessible ride provider for testing recommendations.', '', {
      wheelchair: 'Available', minimum_age: 18, lead_days: 1, languages: ['English'], evidence_origin: 'Fictional practice service',
      access: 'Practice workflow. Record a synthetic result to observe the ranking change.'
    }),
  service('practice-ride-b', 'Practice · Lakeside Community Rides', 'Transportation', catchment,
    'Fictional community ride provider with mixed capacity outcomes.', '', {
      wheelchair: 'Available', minimum_age: 18, lead_days: 2, languages: ['English'], evidence_origin: 'Fictional practice service'
    }),
  service('practice-home', 'Practice · Neighbour Home Help', 'Home supports', catchment,
    'Fictional household support provider for testing service feedback.', '', {
      minimum_age: 18, evidence_origin: 'Fictional practice service'
    })
];

export function practiceOutcomes(now = new Date()) {
  return Array.from({ length: 48 }, (_, index) => {
    const set = index < 20 ? 0 : index < 40 ? 1 : 2;
    const delivered = set === 0 ? index % 5 !== 0 : set === 1 ? index % 2 === 0 : index % 4 !== 0;
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - 1 - index);
    const delivery = index % 17 === 0 ? 'Pending' : delivered ? 'Received' : 'Not received';
    return {
      id: 'practice-' + index, owner_id: 'practice', service_id: practiceCatalog[set].id,
      category: practiceCatalog[set].category, region: 'Georgina', age_band: '40–64', mobility: 'Wheelchair',
      language: 'English', timing: 'Flexible', delivery,
      satisfaction: delivery === 'Received' ? 3 + (index % 3) : null, reason: delivery === 'Received' ? 'None' : 'Capacity',
      occurred_on: date.toISOString().slice(0, 10), created_at: date.toISOString(), share: 0, version: 1
    };
  });
}

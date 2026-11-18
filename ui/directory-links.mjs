export function directoryLinks(context = {}) {
  const { category, region, mobility } = context;
  const area = region === 'North York' ? 'NorthYork' : ['Bradford', 'Innisfil'].includes(region) ? 'SouthSimcoe' : region ? 'YorkRegion' : '';
  const topics = { 'Home supports': '10106', 'Food and nutrition': '10107', 'Caregiver support': '10164', 'Language access': '10569', 'Financial assistance': '10448', 'Social connection': '10104' };
  const topic = category === 'Transportation' ? mobility === 'Wheelchair' ? '10109' : '10321' : topics[category];
  const healthline = new URL(topic ? 'https://www.centralhealthline.ca/listServices.aspx' : 'https://www.centralhealthline.ca/listcategories.aspx');
  healthline.searchParams.set('id', topic || '10012');
  if (area) healthline.searchParams.set('region', area);
  const topicLabels = { 'Home supports': 'Home help and homemaking', 'Food and nutrition': 'Meal delivery', 'Caregiver support': 'Caregiver support', 'Language access': 'Interpretation and translation', 'Financial assistance': 'Financial help for people with disabilities', 'Social connection': 'Friendly visiting' };
  const topicLabel = category === 'Transportation' ? mobility === 'Wheelchair' ? 'Accessible transportation' : 'Volunteer and non-accessible transport' : topicLabels[category] || 'Home and community supports';
  const links = [{ name: 'Centralhealthline', detail: [topicLabel, area === 'YorkRegion' ? 'York Region' : area === 'SouthSimcoe' ? 'South Simcoe' : region || 'Central'].join(' · '), url: healthline.href },
    { name: '211 Ontario', detail: 'Search the wider community and social service directory', url: 'https://211ontario.ca/search/' }];
  if (category === 'Transportation' && mobility !== 'Wheelchair') {
    const accessible = new URL(healthline); accessible.searchParams.set('id', '10109');
    links.push({ name: 'Accessible transportation', detail: 'Centralhealthline accessible transport directory', url: accessible.href });
  }
  if (category === 'Home supports') links.push({ name: 'Ontario Health atHome', detail: 'Public home-care referral information', url: 'https://www.ontariohealthathome.ca/making-a-referral/' });
  return links;
}

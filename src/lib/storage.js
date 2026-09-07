/**
 * Local persistence for the parsed menu.
 *
 * Capacitor Preferences uses native SharedPreferences on Android and falls back
 * to localStorage in the browser, so the same code works in `npm run dev`.
 */
import { Preferences } from '@capacitor/preferences';

const MENU_KEY = 'mess-menu-data';
const CATEGORY_KEY = 'mess-menu-category';

export async function loadMenu() {
  try {
    const { value } = await Preferences.get({ key: MENU_KEY });
    if (!value) return null;
    const data = JSON.parse(value);
    if (!data || !Array.isArray(data.categories) || !data.categories.length) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export async function saveMenu(data) {
  await Preferences.set({ key: MENU_KEY, value: JSON.stringify(data) });
}

export async function clearMenu() {
  await Preferences.remove({ key: MENU_KEY });
}

export async function loadCategory() {
  try {
    const { value } = await Preferences.get({ key: CATEGORY_KEY });
    return value || null;
  } catch (e) {
    return null;
  }
}

export async function saveCategory(name) {
  await Preferences.set({ key: CATEGORY_KEY, value: name });
}

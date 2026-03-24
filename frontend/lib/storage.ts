/**
 * Storage utility that abstracts localStorage for web
 * Can be easily swapped with AsyncStorage for React Native
 */

class Storage {
  async getItem(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error("Error reading from storage:", error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error("Error writing to storage:", error);
    }
  }

  async removeItem(key: string): Promise<void> {
    
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error("Error removing from storage:", error);
    }
  }

  async clear(): Promise<void> {
    
    try {
      localStorage.clear();
    } catch (error) {
      console.error("Error clearing storage:", error);
    }
  }
}

export const storage = new Storage();

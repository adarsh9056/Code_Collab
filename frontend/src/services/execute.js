import { api } from './api';

/**
 * Execute code using the backend execution service
 * @param {Object} params - Execution parameters
 * @param {string} params.source_code - The code to execute
 * @param {string} params.language - javascript | python | cpp | java
 * @param {string} [params.stdin] - Optional standard input
 * @returns {Promise<Object>} The execution result
 */
export const executeCode = async ({ source_code, language, stdin = '' }) => {
  try {
    const response = await api.post('/execute', {
      source_code,
      language,
      stdin
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      return error.response.data;
    }
    return {
      success: false,
      message: error.message || 'Error connecting to execution service'
    };
  }
};

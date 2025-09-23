import axios from 'axios'
import FormData from 'form-data'

export class CloudflareService {
  private accountId: string
  private apiToken: string
  private apiUrl: string

  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || ''
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN || ''
    this.apiUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1`
  }

  async uploadImage(fileBuffer: Buffer, filename: string): Promise<string> {
    try {
      const formData = new FormData()
      formData.append('file', fileBuffer, {
        filename: filename,
        contentType: 'image/jpeg'
      })

      const response = await axios.post(this.apiUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${this.apiToken}`,
        },
      })

      if (response.data.success) {
        return response.data.result.variants[0] // 返回图片的URL
      } else {
        throw new Error('Upload failed')
      }
    } catch (error) {
      console.error('Cloudflare upload error:', error)
      throw error
    }
  }
}

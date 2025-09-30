import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import axios from 'axios'

interface MetaConversionEvent {
  event_name: string
  event_time: number
  action_source: string
  user_data: {
    em?: string[] // email hash
    ph?: string[] // phone hash
    client_ip_address?: string
    client_user_agent?: string
    fbc?: string // Facebook click ID
    fbp?: string // Facebook browser ID
  }
  custom_data?: {
    value?: number
    currency?: string
    content_name?: string
    content_category?: string
    content_ids?: string[]
    num_items?: number
  }
}

interface MetaConversionsRequest {
  data: MetaConversionEvent[]
  test_event_code?: string
}

export async function metaConversionsRoutes(fastify: FastifyInstance) {
  const PIXEL_ID = process.env.META_PIXEL_ID
  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN
  const API_URL = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events`

  // 发送转化事件
  fastify.post('/api/v1/meta/conversions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!PIXEL_ID || !ACCESS_TOKEN) {
        return reply.code(500).send({ 
          error: 'Meta Pixel configuration missing' 
        })
      }

      const { data, test_event_code } = request.body as MetaConversionsRequest
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        return reply.code(400).send({ 
          error: 'Invalid event data' 
        })
      }

      // 为每个事件添加默认值
      const processedEvents = data.map(event => ({
        ...event,
        action_source: event.action_source || 'website',
        event_time: event.event_time || Math.floor(Date.now() / 1000)
      }))

      const payload = {
        data: processedEvents,
        access_token: ACCESS_TOKEN,
        ...(test_event_code && { test_event_code })
      }

      console.log('Sending Meta conversion events:', {
        pixelId: PIXEL_ID,
        eventCount: processedEvents.length,
        events: processedEvents.map(e => e.event_name)
      })

      const response = await axios.post(API_URL, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      console.log('Meta API response:', response.data)

      return {
        success: true,
        events_received: response.data.events_received,
        messages: response.data.messages || [],
        fbtrace_id: response.data.fbtrace_id
      }

    } catch (error) {
      console.error('Meta Conversions API error:', error)
      
      if (axios.isAxiosError(error)) {
        console.error('Response status:', error.response?.status)
        console.error('Response data:', error.response?.data)
        
        return reply.code(error.response?.status || 500).send({
          error: 'Meta API request failed',
          details: error.response?.data
        })
      }

      return reply.code(500).send({
        error: 'Internal server error'
      })
    }
  })

  // 获取测试事件
  fastify.get('/api/v1/meta/test-events', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!PIXEL_ID || !ACCESS_TOKEN) {
        return reply.code(500).send({ 
          error: 'Meta Pixel configuration missing' 
        })
      }

      const testEventsUrl = `https://graph.facebook.com/v18.0/${PIXEL_ID}/test_events`
      
      const response = await axios.get(testEventsUrl, {
        params: {
          access_token: ACCESS_TOKEN
        }
      })

      return response.data

    } catch (error) {
      console.error('Meta test events error:', error)
      
      if (axios.isAxiosError(error)) {
        return reply.code(error.response?.status || 500).send({
          error: 'Meta API request failed',
          details: error.response?.data
        })
      }

      return reply.code(500).send({
        error: 'Internal server error'
      })
    }
  })

  // 验证像素配置
  fastify.get('/api/v1/meta/pixel-info', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!PIXEL_ID || !ACCESS_TOKEN) {
        return reply.code(500).send({ 
          error: 'Meta Pixel configuration missing' 
        })
      }

      const pixelInfoUrl = `https://graph.facebook.com/v18.0/${PIXEL_ID}`
      
      const response = await axios.get(pixelInfoUrl, {
        params: {
          access_token: ACCESS_TOKEN,
          fields: 'id,name,status'
        }
      })

      return {
        success: true,
        pixel: response.data
      }

    } catch (error) {
      console.error('Meta pixel info error:', error)
      
      if (axios.isAxiosError(error)) {
        return reply.code(error.response?.status || 500).send({
          error: 'Meta API request failed',
          details: error.response?.data
        })
      }

      return reply.code(500).send({
        error: 'Internal server error'
      })
    }
  })
}
